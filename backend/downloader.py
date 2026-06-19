import yt_dlp
import os
import time
import sys
import asyncio
import threading
from typing import Optional, Dict, Any
from dataclasses import dataclass, asdict
from utils import get_downloads_dir, get_cookies_path, parse_time
from database import mark_downloaded_db, mark_error_db, remove_job_from_queue
from metadata_fetcher import apply_metadata
from proxy_manager import get_random_proxy
from lyrics_fetcher import fetch_and_embed_lyrics
from yt_dlp.networking.impersonate import ImpersonateTarget

TRANSIENT_ERRORS = ("rate-limited", "try again later", "HTTP Error 429", "temporarily unavailable", "network is unreachable")
LOGIN_ERRORS = ("Sign in required", "account problem", "private video")
FORMAT_ERRORS = ("Requested format is not available", "requested format is not available")

def is_match(err_msg: str, fragments) -> bool:
    return any(f.lower() in err_msg.lower() for f in fragments)

EQ_PRESETS = {
    'bass': 'equalizer=f=60:width_type=h:width=50:g=10',
    'soft': 'equalizer=f=1000:width_type=h:width=200:g=-5',
    'treble': 'equalizer=f=14000:width_type=h:width=1000:g=10',
    'vocal': 'equalizer=f=3000:width_type=h:width=1000:g=5'
}

@dataclass
class JobState:
    id: str
    status: str
    progress: float
    title: Optional[str] = None
    filename: Optional[str] = None
    error: Optional[str] = None
    created_at: float = 0.0
    started_at: Optional[float] = None
    finished_at: Optional[float] = None
    last_update: float = 0.0
    speed_str: Optional[str] = None
    total_bytes_str: Optional[str] = None
    downloaded_bytes_str: Optional[str] = None

jobs: Dict[str, JobState] = {}
download_queue: asyncio.Queue = asyncio.Queue()
MAX_CONCURRENT_DOWNLOADS = 4
download_sem = asyncio.Semaphore(MAX_CONCURRENT_DOWNLOADS)
# Twitch streams require sequential processing due to live-stream token conflicts
twitch_sem = asyncio.Semaphore(1)
main_event_loop = None
active_tasks = {}

async def memory_reaper():
    """Background task to clear old completed jobs from memory to prevent leaks."""
    while True:
        await asyncio.sleep(3600)  # run every 1 hour
        now = time.time()
        stale_jobs = []
        for j_id, st in jobs.items():
            if st.status in ["completed", "error", "cancelled", "rate_limited"]:
                if now - st.last_update > 43200: # 12 hours
                    stale_jobs.append(j_id)
        
        for j_id in stale_jobs:
            jobs.pop(j_id, None)
            active_tasks.pop(j_id, None)
        
        if stale_jobs:
            print(f"[\033[90mMemory Reaper\033[0m] Cleared {len(stale_jobs)} old jobs from RAM.")

def build_ydl_opts(job_id: str, request) -> Dict[str, Any]:
    downloads_dir = get_downloads_dir()
    os.makedirs(downloads_dir, exist_ok=True)
    
    organize_by_artist = getattr(request, 'organize', False)
    organize_by_playlist = getattr(request, 'organize_by_playlist', False)
    
    if organize_by_playlist and organize_by_artist:
        outtmpl = os.path.join(downloads_dir, '%(playlist_title|Avulsas)s', '%(artist,uploader|Unknown Artist)s', '%(title)s.%(ext)s')
    elif organize_by_playlist:
        outtmpl = os.path.join(downloads_dir, '%(playlist_title|Avulsas)s', '%(title)s.%(ext)s')
    elif organize_by_artist:
        outtmpl = os.path.join(downloads_dir, '%(artist,uploader|Unknown Artist)s', '%(album|Singles)s', '%(title)s.%(ext)s')
    else:
        outtmpl = os.path.join(downloads_dir, '%(title)s.%(ext)s')

    resource_dir = os.path.dirname(os.path.abspath(__file__))
    if getattr(sys, 'frozen', False):
        if hasattr(sys, '_MEIPASS'):
            resource_dir = sys._MEIPASS
        else:
            resource_dir = os.path.join(os.path.dirname(sys.executable), '_internal')

    format_str = 'bestaudio/best'
    postprocessors = []

    if request.mode == 'video':
        video_codec = getattr(request, 'video_codec', 'auto')
        vc_map = {'h264': 'avc', 'vp9': 'vp9', 'av1': 'av01'}
        vc = vc_map.get(video_codec, '')

        format_str = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
        if vc:
            format_str = f'bestvideo[vcodec^={vc}]+bestaudio/bestvideo+bestaudio/best'

        if request.quality.endswith('p') and request.quality[:-1].isdigit():
            height = int(request.quality[:-1])
            if height >= 1440:
                format_str = f'bestvideo[height>={height}][vcodec^={vc}]+bestaudio/bestvideo[height>={height}]+bestaudio' if vc else f'bestvideo[height>={height}]+bestaudio'
            else:
                format_str = f'bestvideo[height<={height}][vcodec^={vc}]+bestaudio/bestvideo[height<={height}]+bestaudio' if vc else f'bestvideo[height<={height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={height}]+bestaudio/best'
        
        postprocessors.append({'key': 'FFmpegMetadata'})
    else:
        audio_extract = {'key': 'FFmpegExtractAudio'}
        
        if request.quality == 'flac':
             audio_extract['preferredcodec'] = 'flac'
             # FLAC é lossless, FFmpeg quebra se passarmos bitrate pra ele.
        elif request.quality == 'best': 
             audio_extract['preferredcodec'] = 'm4a'
             audio_extract['preferredquality'] = '320'
        elif request.quality == 'medium':
             audio_extract['preferredcodec'] = 'mp3'
             audio_extract['preferredquality'] = '128'
        elif request.quality == 'high':
             audio_extract['preferredcodec'] = 'mp3'
             audio_extract['preferredquality'] = '192'
        else:
             audio_extract['preferredcodec'] = 'mp3'
             audio_extract['preferredquality'] = '320'

        postprocessors.append(audio_extract)
        postprocessors.append({'key': 'FFmpegThumbnailsConvertor', 'format': 'jpg'})
        postprocessors.append({'key': 'EmbedThumbnail'})
        postprocessors.append({'key': 'FFmpegMetadata'})

    postprocessor_args = {}
    
    if getattr(request, 'compress_video', False) and request.mode == 'video':
        postprocessor_args['video'] = ['-c:v', 'libx264', '-crf', '28', '-preset', 'fast', '-b:v', '0']
        
    af_filters = []
    if request.pitch != 0 or request.speed != 1.0:
         pitch_factor = 2 ** (request.pitch / 12.0)
         new_rate = int(44100 * pitch_factor)
         required_atempo = request.speed / pitch_factor
         atempos = []
         while required_atempo > 2.0:
             atempos.append(2.0)
             required_atempo /= 2.0
         while required_atempo < 0.5:
             atempos.append(0.5)
             required_atempo /= 0.5
         atempos.append(required_atempo)
         af_filters.append(f"asetrate={new_rate}")
         for t in atempos: af_filters.append(f"atempo={t}")
         af_filters.append("aresample=44100")

    if request.eq_preset and request.eq_preset in EQ_PRESETS:
         af_filters.append(EQ_PRESETS[request.eq_preset])

    if getattr(request, 'spatial_audio', False) and request.mode != 'video':
         af_filters.append("apulsator=mode=sine:hz=0.125,aecho=0.8:0.9:1000:0.3")

    if request.mode != 'video':
         af_filters.append("loudnorm=I=-16:TP=-1.5:LRA=11")

    if af_filters:
         postprocessor_args['extractaudio'] = ['-af', ",".join(af_filters)]

    # Crop thumbnail to square (1:1) to remove white/black side bars on 16:9 covers
    if request.mode != 'video':
         postprocessor_args['FFmpegThumbnailsConvertor'] = ['-vf', "crop='min(iw,ih)':'min(iw,ih)'"]

    class StdoutLogger:
        def debug(self, msg): pass
        def warning(self, msg): 
            # Imprime o aviso com cor cinza escuro para não poluir
            print(f"      \033[90m[yt-dlp:warn] {msg}\033[0m")
        def error(self, msg): 
            # Imprime erro com cor vermelha
            print(f"      \033[31m[yt-dlp:err] {msg}\033[0m")

    def local_progress_hook(d):
        if job_id in jobs and jobs[job_id].status == 'cancelled':
            raise Exception("Download cancelado pelo usuario")
        
        if d['status'] == 'downloading':
            try:
                p = d.get('_percent_str', '0%').replace('%','')
                speed = d.get('_speed_str')
                if speed and '~' in speed: speed = speed.replace('~', '')
                if speed and '---b/s' in speed: speed = None
                
                total = d.get('_total_bytes_str') or d.get('_total_bytes_estimate_str')
                if total and '~' in total: total = total.replace('~', '')
                if total and 'Unknown' in total: total = None
                
                down = d.get('_downloaded_bytes_str')
                if down and '~' in down: down = down.replace('~', '')
                if down and 'Unknown' in down: down = None

                if job_id in jobs:
                    if jobs[job_id].status != 'cancelled':
                        jobs[job_id].status = 'downloading'
                    try:
                        jobs[job_id].progress = float(p)
                    except: pass
                    if speed: jobs[job_id].speed_str = speed.strip()
                    if total: jobs[job_id].total_bytes_str = total.strip()
                    if down: jobs[job_id].downloaded_bytes_str = down.strip()
                    jobs[job_id].title = d.get('info_dict', {}).get('title') or jobs[job_id].title
            except Exception as e:
                pass
        elif d['status'] == 'finished':
            if job_id in jobs and jobs[job_id].status != 'cancelled':
                jobs[job_id].progress = 100
                jobs[job_id].status = 'processing'

    ydl_opts = {
        "socket_timeout": 15,
        'format': format_str,
        'outtmpl': outtmpl,
        'quiet': False, 
        'logger': StdoutLogger(),
        'nocheckcertificate': True,
        'ignoreerrors': False, 
        'no_warnings': False, 
        'writethumbnail': True, 
        'ffmpeg_location': resource_dir, 
        'postprocessors': postprocessors,
        'postprocessor_args': postprocessor_args,
        'progress_hooks': [local_progress_hook],
        'noplaylist': not request.playlist,
        'merge_output_format': 'mp4' if request.mode == 'video' else None,
        'extract_flat': False,
        'cookiefile': get_cookies_path(),
        'no_overwrites': True,
        'extractor_args': {'youtube': {'player_client': ['tv']}},
        'concurrent_fragment_downloads': 16,
    }
    
    # Hybrid Trim Logic
    if getattr(request, 'start_time', None) or getattr(request, 'end_time', None):
        def make_download_range_func(start_time, end_time):
            def download_range_func(info_dict, ydl):
                is_live = info_dict.get('is_live')
                duration = info_dict.get('duration', 0)
                if is_live or duration > 1800:
                    def time_to_sec(t_str):
                        if not t_str: return 0
                        parts = list(map(int, t_str.split(':')))
                        if len(parts) == 2: return parts[0]*60 + parts[1]
                        if len(parts) == 3: return parts[0]*3600 + parts[1]*60 + parts[2]
                        return 0
                    s = time_to_sec(start_time) if start_time else 0
                    e = time_to_sec(end_time) if end_time else duration
                    return [{'start_time': s, 'end_time': e}]
                return [{}]
            return download_range_func
        ydl_opts['download_ranges'] = make_download_range_func(request.start_time, request.end_time)
        ydl_opts['force_keyframes_at_cuts'] = True
    
    aria2c_path = os.path.join(resource_dir, 'aria2c.exe')
    if os.path.exists(aria2c_path) and "twitch.tv" not in request.url.lower():
        ydl_opts['external_downloader'] = aria2c_path
        ydl_opts['external_downloader_args'] = ['-x', '16', '-s', '16', '-k', '1M', '--min-split-size=1M']
    
    # Aplica o "Jittering" (Anti-Ban Sleep Aleatório) para TODOS os downloads e buscas
    # Impede que metralhadoras de ytsearch1: (Spotify) bloqueiem o IP instantaneamente
    ydl_opts["sleep_requests"] = 1.5
    ydl_opts["sleep_interval"] = 6
    ydl_opts["max_sleep_interval"] = 25
    ydl_opts["sleep_subtitles"] = 2
    
    subtitle_lang = getattr(request, 'subtitle', 'none')
    if request.mode == 'video' and subtitle_lang != 'none':
        ydl_opts['writesubtitles'] = True
        if subtitle_lang == 'all':
            ydl_opts['subtitleslangs'] = ['all']
        else:
            ydl_opts['subtitleslangs'] = [subtitle_lang]
        
        # Avoid duplicating FFmpegMetadata or similar if we want to ensure embedsubtitles
        postprocessors.append({'key': 'FFmpegEmbedSubtitle'})
        # Also include automatic subtitles if requested language wasn't manually uploaded
        ydl_opts['writeautomaticsub'] = True

    if request.cover_path and os.path.exists(request.cover_path):
        ydl_opts['writethumbnail'] = False
        postprocessors = [p for p in postprocessors if p.get('key') != 'EmbedThumbnail']

    if getattr(request, 'sponsorblock_enabled', False):
        postprocessors.extend([
            {'key': 'SponsorBlock'},
            {'key': 'ModifyChapters', 'remove_sponsor_segments': ['sponsor', 'intro', 'outro', 'selfpromo']}
        ])

    ydl_opts['postprocessors'] = postprocessors

    return ydl_opts

def build_ydl_opts_for_strategy(job_id: str, request, strategy: dict):
    import deno_manager
    import os
    
    ydl_opts = {
        'concurrent_fragments': 4,
        'cachedir': False,
    }
    
    deno_path = deno_manager.get_deno_path()
    if deno_path:
        deno_dir = os.path.dirname(deno_path)
        if deno_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = f"{deno_dir}{os.pathsep}{os.environ.get('PATH', '')}"
    if 'format' in strategy:
        ydl_opts['format'] = strategy['format']
    
    if strategy.get("use_cookies") and getattr(request, 'cookies_path', None):
        ydl_opts["cookiefile"] = request.cookies_path
    elif strategy.get("use_cookies") and get_cookies_path():
        ydl_opts["cookiefile"] = get_cookies_path()
        
    client = strategy.get("client")
    if strategy.get("extractor_args_override"):
        ydl_opts.setdefault("extractor_args", {})
        ydl_opts["extractor_args"].update(strategy["extractor_args_override"])
    elif client:
        ydl_opts.setdefault("extractor_args", {})
        ydl_opts["extractor_args"]["youtube"] = {"player_client": [client]}
        
    if strategy.get("impersonate"):
        ydl_opts["impersonate"] = ImpersonateTarget(client=strategy.get("impersonate"))
        
    if strategy.get("source_address"):
        ydl_opts["source_address"] = strategy.get("source_address")

    base_opts = build_ydl_opts(job_id, request)
    base_opts.update(ydl_opts)
    
    return base_opts

def download_with_retries(job_id: str, request):
    print(f"\n\033[1;35m[+] INICIANDO SMART DOWNLOAD:\033[0m \033[36m{request.url}\033[0m")
    strategies = [
        {"name": "sabr_live", "format": "ba[protocol=sabr]+bv[protocol=sabr]/bestvideo+bestaudio/best", "use_cookies": True, "client": "web", "extractor_args_override": {'youtubepot-bgutilhttp': {'base_url': ['http://127.0.0.1:4416']}, 'youtube': {'formats': ['duplicate'], 'player_client': ['web'], 'webpage_client': ['web']}}},
        {"name": "tv_embedded", "use_cookies": True, "client": "tv_embedded"},
        {"name": "tv_unplugged", "use_cookies": True, "client": "tv_unplugged"},
        {"name": "web_embedded", "use_cookies": True, "client": "web_embedded", "impersonate": "chrome"},
        {"name": "web_safari", "use_cookies": True, "client": "web_safari", "impersonate": "safari"},
        {"name": "web_creator", "use_cookies": True, "client": "web_creator", "impersonate": "chrome"},
        {"name": "android_creator", "use_cookies": True, "client": "android_creator"},
        {"name": "ios_creator", "use_cookies": True, "client": "ios_creator"},
        {"name": "android_vr", "use_cookies": True, "client": "android_vr"},
        {"name": "ios_music", "use_cookies": True, "client": "ios_music"},
        {"name": "android_music", "use_cookies": True, "client": "android_music"},
        {"name": "standard_web", "use_cookies": True, "client": "web", "impersonate": "chrome"},
        {"name": "tv_client", "use_cookies": True, "client": "tv"},
        {"name": "android_client", "use_cookies": True, "client": "android"},
        {"name": "ios_client", "use_cookies": True, "client": "ios"},
        {"name": "mweb", "use_cookies": True, "client": "mweb", "impersonate": "chrome"},
        {"name": "force_ipv4", "use_cookies": True, "client": "web", "source_address": "0.0.0.0"},
        {"name": "force_ipv6", "use_cookies": True, "client": "web", "source_address": "::"},
        {"name": "fallback_1080p", "format": "bestvideo+bestaudio/best" if request.mode == 'video' else None, "use_cookies": True, "client": "web", "impersonate": "chrome"},
        {"name": "fallback_quality", "format": "bestvideo[height<=720]+bestaudio/best" if request.mode == 'video' else "bestaudio[protocol^=http]", "use_cookies": True, "client": "web", "impersonate": "chrome"},
        {"name": "ytmusic_fallback", "use_ytmusic_search": True, "use_cookies": True, "client": "web_embedded", "impersonate": "chrome"} if request.mode != 'video' and getattr(request, 'title', None) else None,
        {"name": "invidious_fallback", "use_invidious": True, "use_cookies": False, "client": "web", "impersonate": "chrome"},
        {"name": "proxy_survival", "format": "bestaudio[protocol^=http]", "use_cookies": False, "client": "web", "impersonate": "chrome", "use_proxy": True},
    ]
    strategies = [s for s in strategies if s is not None]

    st = jobs.get(job_id)
    if not st or st.status == "cancelled": return

    for idx, strat in enumerate(strategies, start=1):
        if st.status == "cancelled": return
        strat_name = strat['name'].upper()
        print(f"  \033[33m-> [{idx}/{len(strategies)}] Testando método: \033[1;33m{strat_name}\033[0m")
        st.error = None
        if idx > 1:
            st.status = f"retry_method_{idx}"
        st.speed_str = f"Buscando Método {idx}/{len(strategies)}..."
        
        try:
            ydl_opts = build_ydl_opts_for_strategy(job_id, request, strat)
            
            def execute_ydl(opts):
                target_url = request.url
                
                if strat.get("use_invidious"):
                    import re
                    match = re.search(r'(?:v=|/)([0-9A-Za-z_-]{11}).*', target_url)
                    if match:
                        target_url = f"https://yewtu.be/watch?v={match.group(1)}"
                        print(f"      \033[94m-> Roteando via Invidious: {target_url}\033[0m")
                
                elif strat.get("use_ytmusic_search") and getattr(request, 'title', None):
                    artist = getattr(request, 'artist', '') or ''
                    clean_title = f"{artist} {request.title}".strip()
                    target_url = f"ytmsearch1:{clean_title}"
                    print(f"      \033[94m-> Buscando áudio puro no YT Music: {target_url}\033[0m")

                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(target_url, download=True)
                    if 'entries' in info:
                        entries = list(info['entries'])
                        if not entries:
                            raise Exception(f"Nenhum resultado encontrado na busca do YouTube para: {target_url}")
                        
                        # --- Lumina M3U Generator ---
                        if len(entries) > 1 and getattr(request, 'organize_by_playlist', False):
                            playlist_title = info.get('title', 'Playlist').replace('/', '_').replace('\\', '_')
                            first_file = ydl.prepare_filename(entries[0])
                            playlist_dir = os.path.dirname(first_file)
                            m3u_path = os.path.join(playlist_dir, f"{playlist_title}.m3u")
                            
                            try:
                                with open(m3u_path, "w", encoding="utf-8") as f:
                                    f.write("#EXTM3U\n")
                                    for entry in entries:
                                        if entry is None: continue
                                        entry_file = ydl.prepare_filename(entry)
                                        base_p, _ = os.path.splitext(entry_file)
                                        if request.mode == 'video': final_p = base_p + '.mp4'
                                        elif request.quality == 'flac': final_p = base_p + '.flac'
                                        elif request.quality == 'best': final_p = base_p + '.m4a'
                                        else: final_p = base_p + '.mp3'
                                        rel_path = os.path.basename(final_p)
                                        f.write(f"#EXTINF:-1,{entry.get('title', 'Unknown')}\n")
                                        f.write(f"{rel_path}\n")
                            except Exception as e:
                                print(f"  \033[33mWARN Erro ao gerar playlist M3U: {e}\033[0m")
                        
                        info = entries[0]
                        if info is None:
                            raise Exception(f"Resultado vazio retornado pelo YouTube para: {target_url}")
                    filename = ydl.prepare_filename(info)
                    
                    base_path, _ = os.path.splitext(filename)
                    
                    if request.mode == 'video': full_final_path = base_path + '.mp4'
                    elif request.quality == 'flac': full_final_path = base_path + '.flac'
                    elif request.quality == 'best': full_final_path = base_path + '.m4a'
                    else: full_final_path = base_path + '.mp3'
                    
                    final_filename_relative = os.path.relpath(full_final_path, get_downloads_dir())

                    # Clean filename by removing YouTube tags
                    if request.mode != 'video':
                        from metadata_fetcher import clean_title
                        original_name = os.path.basename(base_path)
                        cleaned_name = clean_title(original_name)
                        
                        if cleaned_name != original_name and cleaned_name.strip():
                            new_base_path = os.path.join(os.path.dirname(base_path), cleaned_name)
                            if request.quality == 'flac': new_full_final_path = new_base_path + '.flac'
                            elif request.quality == 'best': new_full_final_path = new_base_path + '.m4a'
                            else: new_full_final_path = new_base_path + '.mp3'
                            
                            try:
                                if os.path.exists(full_final_path) and not os.path.exists(new_full_final_path):
                                    os.rename(full_final_path, new_full_final_path)
                                    full_final_path = new_full_final_path
                                    final_filename_relative = os.path.relpath(full_final_path, get_downloads_dir())
                            except Exception as e:
                                print(f"  \033[33mWARN Erro ao renomear arquivo limpo: {e}\033[0m")

                    # Handle Trimming (start_time / end_time) post-download
                    trim_start = getattr(request, 'start_time', None)
                    trim_end = getattr(request, 'end_time', None)
                    is_live = info.get('is_live')
                    duration = info.get('duration', 0)
                    
                    if (trim_start or trim_end) and not (is_live or duration > 1800):
                        st.status = "processing"
                        print(f"  \033[94m-> Recortando arquivo localmente (Trim)...\033[0m")
                        import subprocess
                        temp_trim_path = full_final_path + ".trimmed.tmp"
                        
                        # Find ffmpeg location
                        ffmpeg_exe = "ffmpeg"
                        resource_dir = os.path.dirname(os.path.abspath(__file__))
                        if getattr(sys, 'frozen', False):
                            if hasattr(sys, '_MEIPASS'): resource_dir = sys._MEIPASS
                            else: resource_dir = os.path.join(os.path.dirname(sys.executable), '_internal')
                        local_ffmpeg = os.path.join(resource_dir, 'ffmpeg.exe')
                        if os.path.exists(local_ffmpeg): ffmpeg_exe = local_ffmpeg
                        
                        trim_cmd = [ffmpeg_exe, "-y"]
                        if trim_start:
                            trim_cmd.extend(["-ss", str(trim_start)])
                        if trim_end:
                            trim_cmd.extend(["-to", str(trim_end)])
                        trim_cmd.extend(["-i", full_final_path, "-c", "copy", temp_trim_path])
                        
                        try:
                            CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
                            subprocess.run(trim_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True, creationflags=CREATE_NO_WINDOW)
                            if os.path.exists(temp_trim_path) and os.path.getsize(temp_trim_path) > 0:
                                os.replace(temp_trim_path, full_final_path)
                                print(f"    \033[32mOK Arquivo recortado com sucesso!\033[0m")
                            else:
                                if os.path.exists(temp_trim_path): os.remove(temp_trim_path)
                                print(f"  \033[33mWARN Falha no recorte, arquivo vazio. Mantendo original.\033[0m")
                        except Exception as e:
                            if os.path.exists(temp_trim_path): os.remove(temp_trim_path)
                            print(f"  \033[33mWARN Erro ao recortar arquivo: {e}\033[0m")

                    # Apply Premium Metadata
                    if request.mode != 'video':
                        st.status = "processing"
                        print(f"  \033[94m-> Buscando metadados premium no iTunes...\033[0m")
                        success = apply_metadata(full_final_path, info.get('title', ''), info.get('thumbnail'))
                        if success:
                            print(f"    \033[32mOK Capa High-Res e Tags injetadas com sucesso!\033[0m")
                        
                        # Inject Lyrics
                        title = info.get('title', '') or getattr(request, 'title', '') or ''
                        artist = info.get('uploader', '') or info.get('artist', '') or getattr(request, 'artist', '') or ''
                        if title:
                            print(f"  \033[94m-> Buscando letra da musica...\033[0m")
                            lyrics_ok = fetch_and_embed_lyrics(full_final_path, title, artist)
                            if lyrics_ok:
                                print(f"    \033[32mOK Letra injetada com sucesso!\033[0m")
                            else:
                                print(f"    Letra nao encontrada, continuando sem ela.")
                    
                    st.status = "done"
                    st.progress = 100.0
                    st.filename = final_filename_relative
                    
                    # Extract the real YouTube video ID from yt-dlp info (authoritative source)
                    real_video_id = info.get('id') or getattr(request, 'video_id', None)
                    real_playlist_id = getattr(request, 'playlist_id', None) or info.get('playlist_id')
                    
                    mark_downloaded_db(real_playlist_id, real_video_id, info.get('title', 'Unknown'), final_filename_relative, request.url)
                    
                    # Telegram Upload Hook
                    import telegram_sync
                    telegram_sync.trigger_upload_if_enabled(full_final_path, info.get('title', 'Unknown'))
                    
                    print(f"  \033[32mOK SUCESSO! Download concluído usando o método: {strat_name}\033[0m\n")

            
            if strat.get("use_proxy"):
                last_proxy_err = None
                success = False
                for proxy_attempt in range(1, 6):
                    if st.status == "cancelled": return
                    proxy = get_random_proxy()
                    if not proxy: break
                    ydl_opts['proxy'] = proxy
                    print(f"      \033[94m[proxy] Tentativa de sobrevivência {proxy_attempt}/5 com proxy: {proxy}\033[0m")
                    try:
                        execute_ydl(ydl_opts)
                        return # SUCESSO!
                    except Exception as proxy_err:
                        last_proxy_err = proxy_err
                        print(f"      \033[31m[proxy:err] Proxy falhou: {str(proxy_err).splitlines()[0][:80]}...\033[0m")
                        time.sleep(1)
                        continue
                if not success:
                    if last_proxy_err: raise last_proxy_err
                    else: raise Exception("Todos os proxies disponíveis falharam na conexão.")
            else:
                execute_ydl(ydl_opts)
                return 

        except Exception as e:
            msg = str(e)
            
            # Formatar erro resumido para o log
            short_msg = msg.split('\n')[0]
            if len(short_msg) > 100: short_msg = short_msg[:97] + "..."
            print(f"  \033[31mERR Falha no método {strat_name}: {short_msg}\033[0m")

            if is_match(msg, TRANSIENT_ERRORS):
                st.status = "rate_limited" 
                time.sleep(2) 
                continue
            if is_match(msg, LOGIN_ERRORS):
                st.status = "error"
                st.error = "Login necessário (YouTube bloqueou o vídeo). Atualize o cookies.txt."
                mark_error_db(getattr(request, 'playlist_id', None), getattr(request, 'video_id', None), "Login Required", st.error)
                print(f"  \033[1;31mERR Download abortado: Proteção de Login ativada.\033[0m\n")
                return 
            if is_match(msg, FORMAT_ERRORS):
                 continue
            time.sleep(1)
            continue
            
    st.status = "error"
    st.error = "Falha em todos os métodos de download (possível link inválido ou bloqueio de IP)."
    mark_error_db(getattr(request, 'playlist_id', None), getattr(request, 'video_id', None), "All strategies failed", st.error)
    print(f"  \033[1;31mERR Download permanentemente falhou para: {request.url}\033[0m\n")

async def run_download(job_id: str, request):
    is_twitch = "twitch.tv" in getattr(request, 'url', '')
    if is_twitch:
        async with twitch_sem:
            await asyncio.to_thread(download_with_retries, job_id, request)
    else:
        await asyncio.to_thread(download_with_retries, job_id, request)

async def worker_loop():
    while True:
        job_id, request = await download_queue.get()
        st = jobs.get(job_id)
        if st and st.status == "cancelled":
            download_queue.task_done()
            continue
        
        async with download_sem:
            if st:
                st.status = "running"
                st.started_at = time.time()
                
            try:
                task = asyncio.create_task(run_download(job_id, request))
                done, pending = await asyncio.wait([task], timeout=14400) # 4 hours timeout for large 4K files

                if pending:
                    for t in pending: t.cancel()
                    if st:
                        st.status = "timeout"
                        st.error = "Download cancelado por tempo excedido (timeout 4 horas)"
                else:
                    try:
                        await task
                        if st and st.status not in ["error", "timeout"]: 
                             st.status = "done"
                             st.finished_at = time.time()
                    except Exception as task_error:
                        raise task_error

            except asyncio.CancelledError:
                 if st: st.status = "cancelled"
            except Exception as e:
                if st:
                    st.status = "error"
                    st.error = str(e)
                    st.finished_at = time.time()
                    st.progress = 100.0
            finally:
                remove_job_from_queue(job_id)
                download_queue.task_done()
