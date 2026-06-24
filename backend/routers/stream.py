from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import os
import yt_dlp

from utils import clean_url, get_cookies_path, get_data_dir
from database import get_downloaded_ids

router = APIRouter()

class SearchRequest(BaseModel):
    query: str
    limit: int = 20

@router.post("/search")
async def search_youtube(request: SearchRequest):
    query = request.query.strip()
    is_ytm = False
    if query.lower().startswith("music:"):
        is_ytm = True
        query = query[6:].strip()
    elif query.lower().startswith("ytm:"):
        is_ytm = True
        query = query[4:].strip()

    if is_ytm:
        try:
            import requests as cffi_requests
            api_url = "https://music.youtube.com/youtubei/v1/search?prettyPrint=false"
            headers = {
                "Content-Type": "application/json",
                "User-Agent": "com.google.android.apps.youtube.music/6.20.51 (Linux; U; Android 13; en_US) gzip"
            }
            payload = {
                "context": {
                    "client": {
                        "clientName": "ANDROID_MUSIC",
                        "clientVersion": "6.20.51",
                        "androidSdkVersion": 33,
                        "osName": "Android",
                        "osVersion": "13",
                    }
                },
                "query": query
            }
            res = cffi_requests.post(api_url, json=payload, headers=headers, impersonate="chrome120", timeout=10)
            if res.status_code == 200:
                data = res.json()
                results = []
                contents = data.get("contents", {}).get("tabbedSearchResultsRenderer", {}).get("tabs", [{}])[0].get("tabRenderer", {}).get("content", {}).get("sectionListRenderer", {}).get("contents", [])
                for section in contents:
                    if "musicShelfRenderer" in section:
                        items = section["musicShelfRenderer"].get("contents", [])
                        for item in items:
                            if "musicResponsiveListItemRenderer" in item:
                                info = item["musicResponsiveListItemRenderer"]
                                columns = info.get("flexColumns", [])
                                if len(columns) > 0:
                                    first_col = columns[0].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}).get("runs", [{}])[0]
                                    name = first_col.get("text", "Desconhecido")
                                    video_id = first_col.get("navigationEndpoint", {}).get("watchEndpoint", {}).get("videoId")
                                    if video_id:
                                        uploader = "YouTube Music"
                                        if len(columns) > 1:
                                            second_col_runs = columns[1].get("musicResponsiveListItemFlexColumnRenderer", {}).get("text", {}).get("runs", [])
                                            if second_col_runs:
                                                uploader = "".join([r.get("text", "") for r in second_col_runs])
                                        
                                        thumbnail = f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"
                                        thumbnails = info.get("thumbnail", {}).get("musicThumbnailRenderer", {}).get("thumbnail", {}).get("thumbnails", [])
                                        if thumbnails:
                                            thumbnail = thumbnails[-1].get("url", thumbnail)
                                            
                                        results.append({
                                            "id": video_id,
                                            "title": name,
                                            "uploader": uploader,
                                            "duration_string": "",
                                            "url": f"https://music.youtube.com/watch?v={video_id}",
                                            "thumbnail": thumbnail,
                                            "view_count": 0
                                        })
                                        if len(results) >= request.limit:
                                            break
                        if len(results) >= request.limit:
                            break
                if results:
                    return {"results": results}
        except Exception as e:
            print(f"YT Music search failed: {e}. Falling back to yt-dlp.")

    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'cookiefile': get_cookies_path()
    }
    query_str = f"ytsearch{request.limit}:{query}"
    
    def perform_search(opts):
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(query_str, download=False)
            if 'entries' in info:
                results = []
                for entry in info['entries']:
                    if entry:
                        dur = entry.get('duration')
                        dur_str = f"{int(dur)//60}:{int(dur)%60:02d}" if dur else ""
                        results.append({
                            "id": entry.get('id'),
                            "title": entry.get('title'),
                            "uploader": entry.get('uploader'),
                            "duration_string": dur_str,
                            "url": entry.get('url') or f"https://www.youtube.com/watch?v={entry.get('id')}",
                            "thumbnail": entry.get('thumbnail') or f"https://i.ytimg.com/vi/{entry.get('id')}/mqdefault.jpg",
                            "view_count": entry.get('view_count', 0)
                        })
                return {"results": results}
            return {"results": []}

    try:
        return perform_search(ydl_opts)
    except Exception as e:
        error_msg = str(e)
        if "does not look like a Netscape format cookies file" in error_msg or "cookie" in error_msg.lower():
            print(f"Cookie error in search, falling back without cookies: {error_msg}")
            ydl_opts.pop('cookiefile', None)
            try:
                return perform_search(ydl_opts)
            except Exception as e2:
                print(f"Fallback search error: {e2}")
                raise HTTPException(status_code=500, detail=str(e2))
        else:
            print(f"Search error: {error_msg}")
            raise HTTPException(status_code=500, detail=error_msg)

import functools

@functools.lru_cache(maxsize=32)
def parse_magic_url(url: str):
    from magic_parsers import extract_magic_url
    res = extract_magic_url(url)
    if res:
        pseudo_playlist, is_magic, magic_source, cover_url, new_url = res
        return new_url, pseudo_playlist, is_magic, magic_source, cover_url
    return url, None, False, None, None

# ──────────────────────────────────────────────────────────────────────────────
# STREAMING — resolve audio URL without downloading
# ──────────────────────────────────────────────────────────────────────────────

class StreamResolveRequest(BaseModel):
    query: str  # YouTube URL or search text

class StreamPlaylistRequest(BaseModel):
    url: str

def _ydl_stream_opts():
    """Common yt-dlp options for streaming (no download)."""
    opts = {
        'format': 'bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio',
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
        'skip_download': True,
    }
    # Re-use cookies if available
    cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
    if os.path.exists(cookies_path):
        opts['cookiefile'] = cookies_path
    return opts

@router.post("/api/stream/resolve")
async def stream_resolve(request: StreamResolveRequest):
    """
    Resolve a YouTube URL or search query to a direct audio stream URL.
    Returns: { url, title, artist, thumbnail, duration, video_id }
    """
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    # Detect if it's a URL or a search term
    is_url = query.startswith("http://") or query.startswith("https://")
    search_query = query if is_url else f"ytsearch1:{query}"

    try:
        opts = _ydl_stream_opts()
        opts['noplaylist'] = True

        def _resolve():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(search_query, download=False)
                # ytsearch returns a playlist-like object with one entry
                if 'entries' in info:
                    info = info['entries'][0]
                if not info:
                    return None
                # Get the best audio format URL
                stream_url = info.get('url', '')
                if not stream_url:
                    fmts = info.get('formats', [])
                    audio_fmts = [f for f in fmts if f.get('vcodec') == 'none' and f.get('url')]
                    if audio_fmts:
                        audio_fmts.sort(key=lambda f: f.get('abr') or 0, reverse=True)
                        stream_url = audio_fmts[0]['url']

                # Extract artist from uploader / channel
                artist = (info.get('artist') or info.get('uploader') or
                          info.get('channel') or 'Unknown')

                return {
                    'url': stream_url,
                    'title': info.get('title', 'Unknown'),
                    'artist': artist,
                    'thumbnail': info.get('thumbnail', ''),
                    'duration': info.get('duration', 0),
                    'video_id': info.get('id', ''),
                }

        result = await asyncio.to_thread(_resolve)
        if not result:
            raise HTTPException(status_code=404, detail="Could not resolve stream")
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/stream/playlist")
async def stream_playlist(request: StreamPlaylistRequest):
    """
    Fetch playlist metadata without resolving individual stream URLs.
    Returns: { title, entries: [{ video_id, title, artist, thumbnail, duration }] }
    """
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty")

    try:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,  # Don't fetch individual video info
            'skip_download': True,
        }
        cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookies_path):
            opts['cookiefile'] = cookies_path

        def _fetch():
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if not info:
                    return None
                entries = []
                for entry in (info.get('entries') or []):
                    if not entry:
                        continue
                    entries.append({
                        'video_id': entry.get('id', ''),
                        'title': entry.get('title', 'Unknown'),
                        'artist': entry.get('uploader') or entry.get('channel') or 'Unknown',
                        'thumbnail': entry.get('thumbnail') or (
                            f"https://i.ytimg.com/vi/{entry.get('id', '')}/mqdefault.jpg"
                            if entry.get('id') else ''
                        ),
                        'duration': entry.get('duration', 0),
                        'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                    })
                return {
                    'title': info.get('title', 'Playlist'),
                    'thumbnail': info.get('thumbnail', ''),
                    'entries': entries,
                }

        result = await asyncio.to_thread(_fetch)
        if not result:
            raise HTTPException(status_code=404, detail="Could not load playlist")
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ArtistSearchRequest(BaseModel):
    artist: str

@router.post("/api/stream/artist")
async def stream_artist(request: ArtistSearchRequest):
    """
    Search for an artist's discography on YouTube Music.
    Tries to find their official 'Topic' channel, then falls back to ytsearch.
    Returns: { artist, channel_url, entries: [{video_id, title, artist, thumbnail, duration}] }
    """
    artist_name = request.artist.strip()
    if not artist_name:
        raise HTTPException(status_code=400, detail="Artist name cannot be empty")

    try:
        opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'playlist_items': '1-150',  # limit to 150 tracks
        }
        cookies_path = os.path.join(os.path.dirname(__file__), 'cookies.txt')
        if os.path.exists(cookies_path):
            opts['cookiefile'] = cookies_path

        def _search_artist():
            # Strategy 1: Search YouTube Music for the Topic channel
            search_query = f"ytsearch5:{artist_name} Topic"
            channel_url = None
            channel_name = None

            try:
                with yt_dlp.YoutubeDL({**opts, 'extract_flat': True, 'playlist_items': '1-5'}) as ydl:
                    search_info = ydl.extract_info(search_query, download=False)
                    if search_info and search_info.get('entries'):
                        for entry in search_info['entries']:
                            title = (entry.get('title') or '').lower()
                            chan = (entry.get('channel') or entry.get('uploader') or '').lower()
                            # Look for "Artist - Topic" channels
                            if 'topic' in chan or 'topic' in title:
                                channel_url = entry.get('channel_url') or entry.get('url')
                                channel_name = entry.get('channel') or entry.get('uploader')
                                break
            except Exception:
                pass

            # Strategy 2: Search YouTube Music directly
            if not channel_url:
                try:
                    ytm_search = f"https://music.youtube.com/search?q={artist_name}"
                    # Use ytmsearch as a fallback
                    yt_search = f"ytmsearch10:{artist_name}"
                    with yt_dlp.YoutubeDL({**opts, 'extract_flat': True, 'playlist_items': '1-10'}) as ydl:
                        search_info = ydl.extract_info(yt_search, download=False)
                        if search_info and search_info.get('entries'):
                            for entry in search_info['entries']:
                                chan = (entry.get('channel') or entry.get('uploader') or '')
                                if artist_name.lower() in chan.lower():
                                    channel_url = entry.get('channel_url') or entry.get('uploader_url')
                                    channel_name = chan
                                    break
                except Exception:
                    pass

            # Strategy 3: Fall back to ytsearch for songs by this artist
            if not channel_url:
                entries = []
                try:
                    fallback_query = f"ytsearch50:{artist_name} official audio"
                    with yt_dlp.YoutubeDL({**opts, 'extract_flat': True, 'playlist_items': '1-50'}) as ydl:
                        info = ydl.extract_info(fallback_query, download=False)
                        if info and info.get('entries'):
                            for entry in (info.get('entries') or []):
                                if not entry or not entry.get('id'):
                                    continue
                                entries.append({
                                    'video_id': entry.get('id', ''),
                                    'title': entry.get('title', 'Unknown'),
                                    'artist': entry.get('uploader') or entry.get('channel') or artist_name,
                                    'thumbnail': entry.get('thumbnail') or f"https://i.ytimg.com/vi/{entry.get('id', '')}/mqdefault.jpg",
                                    'duration': entry.get('duration', 0),
                                    'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                                })
                except Exception:
                    pass
                return {'artist': artist_name, 'channel_url': None, 'entries': entries}

            # Fetch the channel's videos
            entries = []
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(channel_url, download=False)
                    if info:
                        raw_entries = info.get('entries') or []
                        # Handle nested playlists (some channels have sub-playlists)
                        for entry in raw_entries:
                            if not entry:
                                continue
                            vid = entry.get('id') or entry.get('url', '').split('v=')[-1].split('&')[0]
                            if not vid:
                                continue
                            entries.append({
                                'video_id': vid,
                                'title': entry.get('title', 'Unknown'),
                                'artist': entry.get('uploader') or entry.get('channel') or channel_name or artist_name,
                                'thumbnail': entry.get('thumbnail') or f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg",
                                'duration': entry.get('duration', 0),
                                'url': f"https://www.youtube.com/watch?v={vid}",
                            })
            except Exception:
                pass

            return {
                'artist': channel_name or artist_name,
                'channel_url': channel_url,
                'entries': entries,
            }

        result = await asyncio.to_thread(_search_artist)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/stream/proxy")
async def stream_proxy(video_id: str = None, url: str = None):
    """
    Proxy a YouTube audio stream through the backend so the browser
    can play it without CORS / header / expiry issues.
    Usage: /api/stream/proxy?video_id=dQw4w9WgXcQ
           /api/stream/proxy?url=https://youtube.com/watch?v=...
    """
    query = url or (f"https://www.youtube.com/watch?v={video_id}" if video_id else None)
    if not query:
        raise HTTPException(status_code=400, detail="Provide video_id or url")

    import urllib.request as _urllib_req

    def _get_stream_url():
        opts = _ydl_stream_opts()
        opts['noplaylist'] = True
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(query, download=False)
            if info and 'entries' in info:
                info = info['entries'][0]
            if not info:
                return None, None, None

            # Find best audio-only format
            stream_url = info.get('url', '')
            content_type = 'audio/webm'
            ext = info.get('ext', 'webm')

            if not stream_url:
                fmts = info.get('formats', [])
                audio_fmts = [f for f in fmts if f.get('vcodec') == 'none' and f.get('url')]
                if audio_fmts:
                    audio_fmts.sort(key=lambda f: f.get('abr') or 0, reverse=True)
                    best = audio_fmts[0]
                    stream_url = best['url']
                    ext = best.get('ext', 'webm')

            if ext in ('m4a', 'mp4'):
                content_type = 'audio/mp4'
            elif ext == 'mp3':
                content_type = 'audio/mpeg'
            elif ext == 'ogg' or ext == 'opus':
                content_type = 'audio/ogg'
            else:
                content_type = 'audio/webm'

            http_headers = info.get('http_headers', {})
            return stream_url, content_type, http_headers

    try:
        stream_url, content_type, http_headers = await asyncio.to_thread(_get_stream_url)
        if not stream_url:
            raise HTTPException(status_code=404, detail="No stream found")

        # Build request with YouTube headers
        req = _urllib_req.Request(stream_url, headers={
            'User-Agent': http_headers.get('User-Agent', 'Mozilla/5.0'),
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.youtube.com/',
            **{k: v for k, v in http_headers.items() if k.lower() not in ('host',)}
        })

        response = await asyncio.to_thread(lambda: _urllib_req.urlopen(req, timeout=15))
        content_length = response.headers.get('Content-Length')

        def _iter_chunks():
            try:
                while True:
                    chunk = response.read(65536)  # 64KB chunks
                    if not chunk:
                        break
                    yield chunk
            finally:
                response.close()

        headers = {'Accept-Ranges': 'bytes'}
        if content_length:
            headers['Content-Length'] = content_length

        return StreamingResponse(
            _iter_chunks(),
            media_type=content_type,
            headers=headers
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




class StreamDownloadRequest(BaseModel):
    url: str
    mode: str = "audio"
    playlist: bool = False

class InfoRequest(BaseModel):
    url: str
    limit: int = 50

@router.post("/info")
async def get_info(request: StreamDownloadRequest):
    try:
        url = clean_url(request.url)
        url, pseudo_playlist, is_magic, magic_source, magic_cover = await asyncio.to_thread(parse_magic_url, url)

        if pseudo_playlist:
            info = pseudo_playlist
            is_playlist = True
            is_magic = True
        else:
            # Prevent falling back to yt-dlp for raw Spotify/Apple Music URLs if magic parser failed
            if any(domain in url for domain in ['spotify.com', 'music.apple.com', 'deezer.com']) and not url.startswith('ytsearch'):
                raise HTTPException(status_code=400, detail="Não foi possível extrair dados deste serviço (verifique se a playlist é privada ou tente novamente mais tarde).")
                
            ydl_opts = {
                'quiet': True,
                'nocheckcertificate': True,
                'extract_flat': 'in_playlist',
                'cookiefile': get_cookies_path(),
                'writesubtitles': True,
                'writeautomaticsub': True,
                'js_runtimes': {
                    'node': {},
                    'deno': {'path': os.path.join(get_data_dir(), 'deno', 'deno.exe')}
                },
                'remote_components': ['ejs:github']
            }
            
            info = None
            last_err = None
            for client in ['web_sabr', 'android_vr', 'tv_embedded', 'web_embedded', 'ios_music', 'android_music', 'tv', 'web', 'web_creator']:
                try:
                    if client == 'web_sabr':
                        ydl_opts['extractor_args'] = {'youtubepot-bgutilhttp': {'base_url': ['http://127.0.0.1:4416']}, 'youtube': {'formats': ['duplicate'], 'player_client': ['web'], 'webpage_client': ['web']}}
                    elif client != 'web':
                        ydl_opts['extractor_args'] = {'youtube': {'player_client': [client]}}
                    elif 'extractor_args' in ydl_opts:
                        del ydl_opts['extractor_args']
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(url, download=False)
                    break
                except Exception as e: 
                    last_err = str(e)
                    if "does not look like a Netscape format cookies file" in last_err or "cookie" in last_err.lower():
                        if 'cookiefile' in ydl_opts:
                            print(f"Cookie error in get_info, retrying without cookies: {last_err}")
                            ydl_opts.pop('cookiefile', None)
                            try:
                                with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                                    info = ydl2.extract_info(url, download=False)
                                break
                            except Exception as e2:
                                last_err = str(e2)
                
            if not info: 
                err_msg = "Falha ao extrair info."
                if last_err: err_msg += f" Detalhes: {last_err}"
                raise HTTPException(status_code=500, detail=err_msg)
                
            if is_magic and not pseudo_playlist and 'entries' in info:
                if len(info['entries']) > 0:
                    info = info['entries'][0]
                else:
                    raise HTTPException(status_code=404, detail="Música não encontrada")
                
            is_playlist = ('entries' in info or info.get('playlist_id')) and (not is_magic or pseudo_playlist is not None) 
        
        duration_str = info.get('duration_string')
        if not duration_str and info.get('duration'):
            import datetime
            duration_str = str(datetime.timedelta(seconds=info['duration']))
            if duration_str.startswith('0:'): duration_str = duration_str[2:] 

        resolutions = []
        if not is_magic:
            if is_playlist:
                resolutions = [2160, 1440, 1080, 720, 480, 360, 240, 144]
            else:
                formats = info.get('formats', [])
                res_set = set()
                for f in formats:
                    if f.get('vcodec') != 'none' and f.get('height'): res_set.add(f['height'])
                resolutions = sorted(list(res_set), reverse=True)

        subs_list = []
        if info.get('subtitles'):
            for lang in info['subtitles'].keys():
                subs_list.append({"code": lang, "name": f"{lang.upper()}", "is_auto": False})
        if info.get('automatic_captions'):
            for lang in info['automatic_captions'].keys():
                if not any(s['code'] == lang for s in subs_list):
                    subs_list.append({"code": lang, "name": f"{lang.upper()} (Auto)", "is_auto": True})

        return {
            "status": "success",
            "title": info['entries'][0].get('title') if ('entries' in info and 'v=' in request.url) else info.get('title'),
            "thumbnail": magic_cover or info.get('thumbnail'),
            "url": info.get('webpage_url', request.url),
            "resolutions": resolutions,
            "subtitles": subs_list,
            "is_playlist": is_playlist,
            "duration": info.get('duration'),
            "duration_string": duration_str,
            "magic_source": magic_source
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/playlist/details")
def get_playlist_details(request: InfoRequest):
    try:
        url, pseudo_playlist, is_magic, magic_source, magic_cover = parse_magic_url(request.url)
        
        if pseudo_playlist:
            playlist_info = pseudo_playlist
        else:
            ydl_opts = {
                'quiet': True,
                'nocheckcertificate': True,
                'ignoreerrors': True,
                'extract_flat': 'in_playlist',
                'cookiefile': get_cookies_path(),
                'js_runtimes': {
                    'node': {},
                    'deno': {'path': os.path.join(get_data_dir(), 'deno', 'deno.exe')}
                },
                'remote_components': ['ejs:github']
            }
            if request.limit > 0: ydl_opts['playlistend'] = request.limit
            
            playlist_info = None
            for client in ['web_embedded', 'tv_embedded', 'web', 'android']:
                try:
                    if client != 'web': ydl_opts['extractor_args'] = {'youtube': {'player_client': [client]}}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        playlist_info = ydl.extract_info(url, download=False)
                    break
                except Exception as e:
                    err_str = str(e)
                    if "does not look like a Netscape format cookies file" in err_str or "cookie" in err_str.lower():
                        if 'cookiefile' in ydl_opts:
                            print(f"Cookie error in playlist details, retrying without cookies: {err_str}")
                            ydl_opts.pop('cookiefile', None)
                            try:
                                with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                                    playlist_info = ydl2.extract_info(url, download=False)
                                break
                            except Exception: pass
                    pass
            
        if not playlist_info or 'entries' not in playlist_info:
            raise HTTPException(status_code=400, detail="URL não é uma playlist ou falhou")
            
        playlist_id = playlist_info.get('id', '')
        downloaded_ids = set(get_downloaded_ids(playlist_id)) if playlist_id else set()
        
        videos = []
        for idx, entry in enumerate(playlist_info['entries']):
            if entry is None: continue
            entry_id = entry.get('id', '')
            videos.append({
                "index": idx,
                "id": entry_id,
                "title": entry.get('title', 'Sem título'),
                "thumbnail": entry.get('thumbnail') or entry.get('thumbnails', [{}])[0].get('url'),
                "duration": entry.get('duration', 0),
                "uploader": entry.get('uploader', entry.get('channel', 'Desconhecido')),
                "url": entry.get('url') or entry.get('webpage_url') or f"https://www.youtube.com/watch?v={entry_id}",
                "status": 'downloaded' if entry_id in downloaded_ids else 'pending',
                "playlistIdRef": playlist_id
            })
            
        return {
            "status": "success",
            "playlist_id": playlist_id,
            "title": playlist_info.get('title', 'Playlist'),
            "total_videos": len(videos),
            "videos": videos,
            "magic_source": magic_source
        }
    except Exception as e:
         raise HTTPException(status_code=500, detail=str(e))

