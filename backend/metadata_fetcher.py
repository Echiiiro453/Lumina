from curl_cffi import requests
import re
import urllib.parse
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TALB, APIC
from mutagen.mp4 import MP4, MP4Cover
from mutagen.flac import FLAC, Picture


def clean_title(title: str) -> str:
    """
    Strips YouTube noise from a title for iTunes search and tag writing.
    Removes: (Official Video), [4K], (Explicit), (Slowed + Reverb), etc.
    """
    if not title or not isinstance(title, str):
        return ""

    patterns = [
        r'\(Official\s*(Music\s*)?Video\)',
        r'\[Official\s*(Music\s*)?Video\]',
        r'\(Official\s*Audio\)',
        r'\[Official\s*Audio\]',
        r'\(Official\s*Lyric\s*Video\)',
        r'\[Official\s*Lyric\s*Video\]',
        r'\(Official\s*Lyrics?\s*Video\)',
        r'\(Official\s*Visualizer\)',
        r'\[Official\s*Visualizer\]',
        r'\(Lyrics?\)',
        r'\[Lyrics?\]',
        r'\(Letra\)',
        r'\(Audio\)',
        r'\[Audio\]',
        r'\[HD\]',
        r'\(HQ\)',
        r'\[HQ\]',
        r'\[4K.*?\]',
        r'\(4K.*?\)',
        r'\(Explicit\)',
        r'\[Explicit\]',
        r'\(Visualizer\)',
        r'\[Visualizer\]',
        r'\(Extended\s*Mix\)',
        r'\(Radio\s*Edit\)',
        r'\(Live.*?\)',
        r'\[Live.*?\]',
        r'\(Slowed.*?\)',
        r'\[Slowed.*?\]',
        r'\(Sped\s*[Uu]p.*?\)',
        r'\[Sped\s*[Uu]p.*?\]',
        r'\(NSFW\)',
        r'\[NSFW\]',
        # --- Languague specific & new noise ---
        r'\(Clipe\s*Oficial.*?\)',
        r'\[Clipe\s*Oficial.*?\]',
        r'\(V[ií]deo\s*Oficial.*?\)',
        r'\[V[ií]deo\s*Oficial.*?\]',
        r'\(Ao\s*Vivo.*?\)',
        r'\[Ao\s*Vivo.*?\]',
        r'\(Ac[uú]stico.*?\)',
        r'\[Ac[uú]stico.*?\]',
        r'\(KondZilla\)',
        r'\[KondZilla\]',
        r'M/?V',
        r'DANCE\s*PERFORMANCE\s*VIDEO',
        # Catch-all pipe separators with video/clipe/official words
        r'\|.*?(video|clipe|oficial|official|kondzilla).*',
        # Generic: anything inside brackets/parens that contains these words
        r'\([^)]*(video|audio|mv|official|oficial|clipe|vevo|upgrade|remaster)[^)]*\)',
        r'\[[^\]]*(video|audio|mv|official|oficial|clipe|vevo|upgrade|remaster)[^\]]*\]',
    ]
    for p in patterns:
        title = re.sub(p, '', title, flags=re.IGNORECASE)

    # Remove dashes separating noise like "- Vídeo Oficial"
    title = re.sub(r'-\s*(V[ií]deo\s*Oficial.*|Clipe\s*Oficial.*)', '', title, flags=re.IGNORECASE)

    # Normalize feat/ft for better iTunes search
    title = re.sub(r'(?i)\b(ft\.|feat\.)\b', ' ', title)

    # Collapse whitespace and strip
    title = re.sub(r'\s+', ' ', title)
    return title.strip(' -–—|')


def clean_title_for_tag(title: str) -> str:
    """
    Cleaner version for writing into the file tag — keeps feat. properly.
    """
    if not title or not isinstance(title, str):
        return ""

    patterns = [
        r'\(Official\s*(Music\s*)?Video\)',
        r'\[Official\s*(Music\s*)?Video\]',
        r'\(Official\s*Audio\)',
        r'\[Official\s*Audio\]',
        r'\(Official\s*Lyric\s*Video\)',
        r'\[Official\s*Lyric\s*Video\]',
        r'\(Official\s*Lyrics?\s*Video\)',
        r'\(Official\s*Visualizer\)',
        r'\[Official\s*Visualizer\]',
        r'\(Lyrics?\)',
        r'\[Lyrics?\]',
        r'\(Letra\)',
        r'\(Audio\)',
        r'\[Audio\]',
        r'\[HD\]',
        r'\(HQ\)',
        r'\[HQ\]',
        r'\[4K.*?\]',
        r'\(4K.*?\)',
        r'\(Explicit\)',
        r'\[Explicit\]',
        r'\(Visualizer\)',
        r'\[Visualizer\]',
        r'\(Extended\s*Mix\)',
        r'\(Radio\s*Edit\)',
        r'\(Live.*?\)',
        r'\[Live.*?\]',
        r'\(Slowed.*?\)',
        r'\[Slowed.*?\]',
        r'\(Sped\s*[Uu]p.*?\)',
        r'\[Sped\s*[Uu]p.*?\]',
        r'\(NSFW\)',
        r'\[NSFW\]',
        # --- Languague specific & new noise ---
        r'\(Clipe\s*Oficial.*?\)',
        r'\[Clipe\s*Oficial.*?\]',
        r'\(V[ií]deo\s*Oficial.*?\)',
        r'\[V[ií]deo\s*Oficial.*?\]',
        r'\(Ao\s*Vivo.*?\)',
        r'\[Ao\s*Vivo.*?\]',
        r'\(Ac[uú]stico.*?\)',
        r'\[Ac[uú]stico.*?\]',
        r'\(KondZilla\)',
        r'\[KondZilla\]',
        r'M/?V',
        r'DANCE\s*PERFORMANCE\s*VIDEO',
        # Catch-all pipe separators
        r'\|.*?(video|clipe|oficial|official|kondzilla).*',
        r'\([^)]*(video|audio|mv|official|oficial|clipe|vevo|upgrade|remaster)[^)]*\)',
        r'\[[^\]]*(video|audio|mv|official|oficial|clipe|vevo|upgrade|remaster)[^\]]*\]',
    ]
    for p in patterns:
        title = re.sub(p, '', title, flags=re.IGNORECASE)
        
    title = re.sub(r'-\s*(V[ií]deo\s*Oficial.*|Clipe\s*Oficial.*)', '', title, flags=re.IGNORECASE)
    title = re.sub(r'\s+', ' ', title)
    return title.strip(' -–—|')


def _fetch_from_itunes(search_query: str, fallback_title: str):
    from config import CHROME_IMPERSONATE
    url = f"https://itunes.apple.com/search?term={urllib.parse.quote(search_query)}&entity=song&limit=1"
    try:
        res = requests.get(url, timeout=10, impersonate=CHROME_IMPERSONATE)
        if res.status_code == 200:
            data = res.json()
            if data.get('results'):
                track = data['results'][0]
                track_name = track.get('trackName', fallback_title)
                artist_name = track.get('artistName', '')
                album_name = track.get('collectionName', '')
                cover_url = track.get('artworkUrl100', '')
                
                cover_data = None
                if cover_url:
                    cover_url = cover_url.replace('100x100bb', '1000x1000bb')
                    cover_res = requests.get(cover_url, timeout=10, impersonate=CHROME_IMPERSONATE)
                    if cover_res.status_code == 200:
                        cover_data = cover_res.content
                return track_name, artist_name, album_name, cover_data
    except Exception as e:
        print(f"      \033[90m[metadata:warn] Erro no iTunes: {e}\033[0m")
    return None

def _fetch_from_deezer(search_query: str, fallback_title: str):
    from config import CHROME_IMPERSONATE
    url = f"https://api.deezer.com/search?q={urllib.parse.quote(search_query)}&limit=1"
    try:
        res = requests.get(url, timeout=10, impersonate=CHROME_IMPERSONATE)
        if res.status_code == 200:
            data = res.json()
            if data.get('data'):
                track = data['data'][0]
                track_name = track.get('title', fallback_title)
                artist_name = track.get('artist', {}).get('name', '')
                album_name = track.get('album', {}).get('title', '')
                cover_url = track.get('album', {}).get('cover_xl', '')
                
                cover_data = None
                if cover_url:
                    cover_res = requests.get(cover_url, timeout=10, impersonate=CHROME_IMPERSONATE)
                    if cover_res.status_code == 200:
                        cover_data = cover_res.content
                return track_name, artist_name, album_name, cover_data
    except Exception as e:
        print(f"      \033[90m[metadata:warn] Erro no Deezer: {e}\033[0m")
    return None

def _fetch_from_spotify(search_query: str, fallback_title: str):
    from config import CHROME_IMPERSONATE
    try:
        from magic_parsers import get_spotify_token
        token = get_spotify_token()
        if not token: return None
        
        url = f"https://api.spotify.com/v1/search?q={urllib.parse.quote(search_query)}&type=track&limit=1"
        headers = {"Authorization": f"Bearer {token}"}
        res = requests.get(url, headers=headers, timeout=10, impersonate=CHROME_IMPERSONATE)
        if res.status_code == 200:
            data = res.json()
            items = data.get('tracks', {}).get('items', [])
            if items:
                track = items[0]
                track_name = track.get('name', fallback_title)
                artist_name = ", ".join([a.get('name', '') for a in track.get('artists', [])])
                album_name = track.get('album', {}).get('name', '')
                
                cover_data = None
                images = track.get('album', {}).get('images', [])
                if images:
                    cover_url = images[0].get('url') # [0] is usually the largest (640x640)
                    if cover_url:
                        cover_res = requests.get(cover_url, timeout=10, impersonate=CHROME_IMPERSONATE)
                        if cover_res.status_code == 200:
                            cover_data = cover_res.content
                return track_name, artist_name, album_name, cover_data
    except Exception as e:
        print(f"      \033[90m[metadata:warn] Erro no Spotify: {e}\033[0m")
    return None

def apply_metadata(filepath: str, raw_title: str, fallback_cover_url: str = None) -> bool:
    try:
        search_query = clean_title(raw_title)
        if not search_query: return False
        
        fallback_title = clean_title_for_tag(raw_title)
        
        track_name = fallback_title
        artist_name = ''
        album_name = ''
        cover_data = None
        source_found = None
        
        # 1. Tenta iTunes (Melhor qualidade de capa)
        res = _fetch_from_itunes(search_query, fallback_title)
        if res:
            track_name, artist_name, album_name, cover_data = res
            source_found = "iTunes"
        else:
            print("      \033[90m[metadata] iTunes falhou. Buscando no Spotify...\033[0m")
            # 2. Tenta Spotify (Ótimo para encontrar a música)
            res = _fetch_from_spotify(search_query, fallback_title)
            if res:
                track_name, artist_name, album_name, cover_data = res
                source_found = "Spotify"
            else:
                print("      \033[90m[metadata] Spotify falhou. Buscando no Deezer...\033[0m")
                # 3. Tenta Deezer (Fallback final super robusto)
                res = _fetch_from_deezer(search_query, fallback_title)
                if res:
                    track_name, artist_name, album_name, cover_data = res
                    source_found = "Deezer"

        if source_found:
            print(f"      \033[32m[metadata] Metadados premium encontrados via {source_found}!\033[0m")
        else:
            if fallback_cover_url:
                print(f"      \033[90m[metadata] Nenhuma fonte premium. Resgatando capa original do provedor...\033[0m")
                from config import CHROME_IMPERSONATE
                try:
                    cover_res = requests.get(fallback_cover_url, timeout=10, impersonate=CHROME_IMPERSONATE)
                    if cover_res.status_code == 200:
                        cover_data = cover_res.content
                        print(f"      \033[32m[metadata] Capa original resgatada com sucesso!\033[0m")
                except Exception as e:
                    pass
            
        # Write to file
        if filepath.lower().endswith('.mp3'):
            audio = MP3(filepath, ID3=ID3)
            if audio.tags is None: audio.add_tags()
            audio.tags.add(TIT2(encoding=3, text=track_name))
            if artist_name:
                audio.tags.add(TPE1(encoding=3, text=artist_name))
            if album_name:
                audio.tags.add(TALB(encoding=3, text=album_name))
            if cover_data:
                audio.tags.add(APIC(encoding=3, mime='image/jpeg', type=3, desc='Cover', data=cover_data))
            audio.save()
            
        elif filepath.lower().endswith('.m4a') or filepath.lower().endswith('.mp4'):
            audio = MP4(filepath)
            if audio.tags is None: audio.add_tags()
            audio.tags['©nam'] = track_name
            if artist_name: audio.tags['©ART'] = artist_name
            if album_name: audio.tags['©alb'] = album_name
            if cover_data:
                audio.tags['covr'] = [MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)]
            audio.save()
            
        elif filepath.lower().endswith('.flac'):
            audio = FLAC(filepath)
            if audio.tags is None: audio.add_tags()
            audio['title'] = track_name
            if artist_name: audio['artist'] = artist_name
            if album_name: audio['album'] = album_name
            if cover_data:
                pic = Picture()
                pic.type = 3
                pic.mime = 'image/jpeg'
                pic.desc = 'Cover'
                pic.data = cover_data
                audio.clear_pictures()
                audio.add_picture(pic)
            audio.save()
            
        if source_found:
            return True
        else:
            print(f"      \033[90m[metadata] Nenhuma fonte encontrou. Titulo limpo aplicado: '{track_name}'\033[0m")
            return False

    except Exception as e:
        print(f"      \033[90m[metadata:warn] Falha fatal ao aplicar metadados: {e}\033[0m")
        return False
