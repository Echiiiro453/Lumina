import re
import json
from config import CHROME_IMPERSONATE

def get_spotify_token():
    import base64
    import requests
    
    # Public spotdl credentials
    client_id = "5f573c9620494bae87890c0f08a60293"
    client_secret = "212476d9b0f3472eaa762d90b19b0ba8"
    
    auth_str = f"{client_id}:{client_secret}"
    b64_auth_str = base64.b64encode(auth_str.encode()).decode()
    headers = {
        "Authorization": f"Basic {b64_auth_str}",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {"grant_type": "client_credentials"}
    res = requests.post("https://accounts.spotify.com/api/token", headers=headers, data=data)
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def _spotipy_fetch(url_type, item_id):
    from SpotipyFree import Spotify as SpotipyFreeClient
    sp = SpotipyFreeClient()
    
    if url_type == "playlist":
        playlist = sp.playlist(item_id)
        playlist_name = playlist.get('name', 'Spotify Playlist')
        owner_dict = playlist.get('owner') or {}
        owner = owner_dict.get('display_name') or owner_dict.get('name') or 'Spotify'
        cover_url = ''
        if playlist.get('images'):
            cover_url = playlist['images'][0]['url']
            
        entries = []
        tracks_data = sp.playlist_items(item_id) or {}
        for idx, item in enumerate(tracks_data.get('items', [])):
            track = item.get('track')
            if not track: continue
            
            t_name = track.get('name', '')
            t_artists = ", ".join([a.get('name', '') for a in track.get('artists', [])])
            duration_ms = track.get('duration_ms', 0)
            
            t_cover = cover_url
            album_dict = track.get('album') or {}
            if album_dict.get('images'):
                t_cover = album_dict['images'][0]['url']
                
            sq = f"{t_artists} {t_name}".strip()
            entries.append({
                'id': f"spotify_magic_{len(entries)}",
                'url': f"ytsearch1:{sq} audio",
                'title': sq,
                'duration': int(duration_ms / 1000) if duration_ms else 0,
                'thumbnail': t_cover
            })
            
        return {
            'title': playlist_name,
            'uploader': owner,
            'entries': entries,
            'thumbnail': cover_url
        }, True, "Spotify", cover_url
        
    elif url_type == "album":
        album = sp.album(item_id)
        album_name = album.get('name', 'Spotify Album')
        owner = ", ".join([a.get('name', '') for a in album.get('artists', [])])
        cover_url = ''
        if album.get('images'):
            cover_url = album['images'][0]['url']
            
        entries = []
        tracks_data = sp.album_tracks(item_id) or {}
        for idx, track in enumerate(tracks_data.get('items', [])):
            if not track: continue
            t_name = track.get('name', '')
            t_artists = ", ".join([a.get('name', '') for a in track.get('artists', [])])
            duration_ms = track.get('duration_ms', 0)
            
            sq = f"{t_artists} {t_name}".strip()
            entries.append({
                'id': f"spotify_magic_{len(entries)}",
                'url': f"ytsearch1:{sq} audio",
                'title': sq,
                'duration': int(duration_ms / 1000) if duration_ms else 0,
                'thumbnail': cover_url
            })
            
        return {
            'title': album_name,
            'uploader': owner,
            'entries': entries,
            'thumbnail': cover_url
        }, True, "Spotify", cover_url
        
    elif url_type == "track":
        track = sp.track(item_id)
        t_name = track.get('name', '')
        t_artists = ", ".join([a.get('name', '') for a in track.get('artists', [])])
        cover_url = ''
        album_dict = track.get('album') or {}
        if album_dict.get('images'):
            cover_url = album_dict['images'][0]['url']
        
        sq = f"{t_artists} {t_name}".strip()
        new_url = f"ytsearch1:{sq} audio"
        return None, True, "Spotify", cover_url, new_url

    return None, False, "Spotify", None, None

def parse_spotify(url: str):
    import re
    from concurrent.futures import ThreadPoolExecutor
    
    match = re.search(r'/(playlist|album|track)/([a-zA-Z0-9]+)', url)
    if not match:
        return None, False, None, None, url
        
    url_type = match.group(1)
    item_id = match.group(2)
    
    try:
        import subprocess
        import sys
        import json
        import os
        
        cmd = []
        if getattr(sys, 'frozen', False):
            cmd = [sys.executable, "--run-spotify", url_type, item_id]
        else:
            main_script = os.path.join(os.path.dirname(__file__), "main.py")
            cmd = [sys.executable, main_script, "--run-spotify", url_type, item_id]
        
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW, text=True, timeout=120)
        
        if proc.returncode == 0 and proc.stdout:
            # We look for the JSON output in stdout
            lines = proc.stdout.strip().splitlines()
            for line in reversed(lines):
                if line.startswith('[') or line.startswith('{'):
                    res = json.loads(line)
                    if not isinstance(res, dict) or "error" not in res:
                        if res and len(res) >= 2 and res[1]:  # res is a list since JSON tuples become lists
                            if res[0] is not None:
                                return res[0], res[1], res[2], res[3], url
                            else:
                                return None, res[1], res[2], res[3], res[4]
                    break
    except Exception as e:
        print(f"Isolated SpotipyFree failed parsing Spotify link: {e}. Falling back to embed...")
        
    # --- Embed HTML Path (Limited to 100 tracks but never crashes and bypasses rate limits) ---
    embed_url = f"https://open.spotify.com/embed/{url_type}/{item_id}"
    try:
        import requests as req
        import json
        res = req.get(embed_url, timeout=10)
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', res.text)
        if match:
            data = json.loads(match.group(1))
            entity = data.get('props', {}).get('pageProps', {}).get('state', {}).get('data', {}).get('entity', {})
            
            cover_url = ''
            if entity.get('coverArt') and entity['coverArt'].get('sources'):
                cover_url = entity['coverArt']['sources'][0]['url']
            elif entity.get('visuals') and entity['visuals'].get('avatar'):
                cover_url = entity['visuals']['avatar'][0]['url']
                
            if url_type in ["playlist", "album"]:
                playlist_name = entity.get('name', 'Spotify Playlist')
                owner = entity.get('subtitle', 'Spotify')
                
                entries = []
                for idx, track in enumerate(entity.get('trackList', [])):
                    t_name = track.get('title', '')
                    t_artist = track.get('subtitle', '')
                    duration_ms = track.get('duration', 0)
                    
                    t_cover = cover_url
                    if track.get('audioPreview') and track['audioPreview'].get('coverArt'):
                        t_cover = track['audioPreview']['coverArt'].get('url', cover_url)
                        
                    sq = f"{t_artist} {t_name}".strip()
                    entries.append({
                        'id': f"spotify_magic_fallback_{idx}",
                        'url': f"ytsearch1:{sq} audio",
                        'title': sq,
                        'duration': int(duration_ms / 1000),
                        'thumbnail': t_cover
                    })
                
                if entries:
                    return {
                        'title': playlist_name + (" (Limitado a 100)" if len(entries) == 100 else ""),
                        'uploader': owner,
                        'entries': entries,
                        'thumbnail': cover_url
                    }, True, "Spotify", cover_url, url
                    
            elif url_type == "track":
                t_name = entity.get('name', '')
                t_artist = entity.get('subtitle', '')
                sq = f"{t_artist} {t_name}".strip()
                new_url = f"ytsearch1:{sq} audio"
                return None, True, "Spotify", cover_url, new_url
    except Exception as fallback_err:
        print(f"Spotify embed fallback failed: {fallback_err}")
        
    return None, True, "Spotify", None, url


def parse_soundcloud(url: str):
    from curl_cffi import requests as cffi_requests

    # Parse username and playlist slug from URL
    # URL format: https://soundcloud.com/{username}/sets/{playlist-slug}
    url_match = re.match(r'https://soundcloud\.com/([^/]+)/sets/([^/?]+)', url)
    if not url_match:
        print(f"[SoundCloud] Could not parse URL: {url}")
        return None, False, None, None, url

    username = url_match.group(1)
    playlist_slug = url_match.group(2)

    # Step 1: Get client_id from JS bundles
    html = cffi_requests.get(url, impersonate=CHROME_IMPERSONATE, timeout=15).text
    js_urls = re.findall(r'<script crossorigin src="([^"]+)"></script>', html)
    client_id = None
    for j_url in js_urls:
        try:
            js_code = cffi_requests.get(j_url, impersonate=CHROME_IMPERSONATE, timeout=10).text
            match = re.search(r'client_id:"([^"]+)"', js_code)
            if match:
                client_id = match.group(1)
                break
        except: pass

    if not client_id:
        print("[SoundCloud] Could not extract client_id")
        return None, False, None, None, url

    # Step 2: Get user_id from the user profile page
    user_page = cffi_requests.get(f"https://soundcloud.com/{username}", impersonate=CHROME_IMPERSONATE, timeout=15).text
    user_id_match = re.search(r'"id":(\d{5,12})', user_page)
    if not user_id_match:
        print(f"[SoundCloud] Could not find user_id for {username}")
        return None, False, None, None, url
    user_id = user_id_match.group(1)

    # Step 3: Fetch all user playlists and find the matching one
    playlists_url = f"https://api-v2.soundcloud.com/users/{user_id}/playlists_without_albums?client_id={client_id}&limit=200"
    res = cffi_requests.get(playlists_url, impersonate=CHROME_IMPERSONATE, timeout=15)
    if res.status_code != 200:
        print(f"[SoundCloud] playlists API returned {res.status_code}")
        return None, False, None, None, url

    data = res.json()
    playlist = None
    for p in data.get('collection', []):
        # Compare by full permalink_url or by slug extracted from it
        p_url = p.get('permalink_url', '')
        p_slug = p_url.rstrip('/').split('/')[-1]
        if p_slug == playlist_slug or p.get('permalink', '') == playlist_slug:
            playlist = p
            break

    if not playlist:
        print(f"[SoundCloud] Playlist '{playlist_slug}' not found among user playlists")
        return None, False, None, None, url

    clean_title = playlist.get('title', 'SoundCloud Playlist')
    cover_url = playlist.get('artwork_url', '') or ''
    if cover_url:
        cover_url = cover_url.replace('-large', '-t500x500')

    # Step 4: Collect tracks (split into full and stub)
    raw_tracks = playlist.get('tracks', [])
    full_tracks = [t for t in raw_tracks if t.get('title')]
    stub_ids = [str(t['id']) for t in raw_tracks if not t.get('title')]

    all_tracks = list(full_tracks)
    for i in range(0, len(stub_ids), 50):
        batch = stub_ids[i:i+50]
        batch_url = f"https://api-v2.soundcloud.com/tracks?ids={','.join(batch)}&client_id={client_id}"
        batch_res = cffi_requests.get(batch_url, impersonate=CHROME_IMPERSONATE, timeout=15)
        if batch_res.status_code == 200:
            all_tracks.extend(batch_res.json())

    entries = []
    for idx, t in enumerate(all_tracks):
        t_artist = t.get('user', {}).get('username', '')
        t_title = t.get('title', '')
        sq = f"{t_artist} {t_title}".strip()
        thumb = t.get('artwork_url', '') or cover_url
        if thumb:
            thumb = thumb.replace('-large', '-t500x500')
        entries.append({
            'id': f"soundcloud_magic_{idx}",
            'url': f"ytsearch1:{sq} audio",
            'title': sq,
            'duration': int(t.get('duration', 0) / 1000),
            'thumbnail': thumb
        })

    if not entries:
        print("[SoundCloud] No tracks found in playlist")
        return None, False, None, None, url

    pseudo_playlist = {
        'title': clean_title,
        'uploader': 'SoundCloud',
        'entries': entries,
        'thumbnail': cover_url
    }
    return pseudo_playlist, True, "SoundCloud", cover_url, url

def parse_deezer(url: str):
    import requests
    match = re.search(r'/(track|album|playlist)/(\d+)', url)
    if match:
        type_str = match.group(1)
        item_id = match.group(2)
        api_url = f"https://api.deezer.com/{type_str}/{item_id}"
        res = requests.get(api_url, timeout=10)
        if res.status_code == 200:
            data = res.json()
            cover_url = data.get('picture_xl') or data.get('cover_xl') or ''
            clean_title = data.get('title', 'Deezer Audio')
            
            if type_str == 'track':
                artist_name = data.get('artist', {}).get('name', '')
                sq = f"{artist_name} {clean_title}".strip()
                url = f"ytsearch1:{sq} audio"
                return None, True, "Deezer", cover_url, url
            else:
                tracks = data.get('tracks', {}).get('data', [])
                entries = []
                for idx, t in enumerate(tracks):
                    t_artist = t.get('artist', {}).get('name', '')
                    t_title = t.get('title', '')
                    sq = f"{t_artist} {t_title}".strip()
                    entries.append({
                        'id': f"deezer_magic_{idx}",
                        'url': f"ytsearch1:{sq} audio",
                        'title': sq,
                        'duration': t.get('duration', 0),
                        'thumbnail': cover_url
                    })
                pseudo_playlist = {
                    'title': clean_title,
                    'uploader': 'Deezer',
                    'entries': entries,
                    'thumbnail': cover_url
                }
                return pseudo_playlist, True, "Deezer", cover_url, url
    return None, False, None, None, url

def parse_apple_music(url: str):
    from curl_cffi import requests as cffi_requests
    import re
    from config import CHROME_IMPERSONATE
    
    res = cffi_requests.get(url, timeout=10, impersonate=CHROME_IMPERSONATE)
    html = res.text
    
    title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
    clean_title = ""
    if title_match:
        clean_title = re.sub(r' \| Spotify.*', '', title_match.group(1))
        clean_title = re.sub(r' on Apple Music.*', '', clean_title)
        clean_title = clean_title.replace("Song ·", "").replace("Album ·", "").strip()
    
    cover_match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    cover_url = cover_match.group(1) if cover_match else ""
    
    token = None
    scripts = re.findall(r'<script[^>]+src="([^"]+/index[^"]+\.js)"', html)
    if scripts:
        js_url = scripts[0]
        if js_url.startswith('/'): js_url = 'https://music.apple.com' + js_url
        try:
            js_res = cffi_requests.get(js_url, timeout=10, impersonate=CHROME_IMPERSONATE)
            for m in re.findall(r'"(eyJh[^"]+)"', js_res.text):
                if len(m) > 100:
                    token = m
                    break
        except:
            pass
    
    is_playlist_or_album = False
    entries = []
    
    url_match = re.search(r'/([a-z]{2})/(playlist|album)/[^/]+/([^/?]+)', url)
    
    if token and url_match:
        storefront = url_match.group(1)
        item_type = url_match.group(2)
        item_id = url_match.group(3)
        
        headers = {
            'authorization': f'Bearer {token}',
            'origin': 'https://music.apple.com'
        }
        
        api_url = f'https://amp-api.music.apple.com/v1/catalog/{storefront}/{item_type}s/{item_id}/tracks?limit=100'
        
        try:
            while api_url:
                api_res = cffi_requests.get(api_url, headers=headers, timeout=10, impersonate=CHROME_IMPERSONATE)
                if api_res.status_code != 200:
                    break
                    
                data = api_res.json()
                tracks_data = data.get('data', [])
                
                for idx, track in enumerate(tracks_data):
                    attrs = track.get('attributes', {})
                    t_title = attrs.get('name', '')
                    t_artist = attrs.get('artistName', '')
                    duration_ms = attrs.get('durationInMillis', 0)
                    
                    if t_title and t_artist:
                        sq = f"{t_artist} {t_title}".strip()
                        entries.append({
                            'id': f"apple_magic_{len(entries)}_{idx}",
                            'url': f"ytsearch1:{sq} audio",
                            'title': sq,
                            'duration': int(duration_ms / 1000) if duration_ms else 0,
                            'thumbnail': cover_url
                        })
                
                next_path = data.get('next')
                if next_path:
                    api_url = f'https://amp-api.music.apple.com{next_path}'
                else:
                    api_url = None
                    
            if entries:
                is_playlist_or_album = True
        except Exception as e:
            print(f"Apple Music API pagination failed: {e}")
    
    if not is_playlist_or_album:
        match = re.search(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
        if match:
            try:
                import json
                data = json.loads(match.group(1))
                tracks = data.get('track', [])
                if tracks:
                    for idx, t in enumerate(tracks):
                        t_name = t.get('name', '')
                        artist_obj = t.get('byArtist', {})
                        t_artist = artist_obj.get('name', '') if isinstance(artist_obj, dict) else (artist_obj if artist_obj else '')
                        if t_name:
                            sq = f"{t_artist} {t_name}".strip()
                            entries.append({
                                'id': f"apple_magic_ld_{idx}",
                                'url': f"ytsearch1:{sq} audio",
                                'title': sq,
                                'duration': 0,
                                'thumbnail': cover_url
                            })
                    if entries:
                        is_playlist_or_album = True
            except Exception as e:
                print(f"Failed to parse Apple Music ld+json: {e}")
    
    if is_playlist_or_album:
        pseudo_playlist = {
            'title': clean_title if clean_title else "Apple Music Playlist",
            'uploader': 'Apple Music',
            'entries': entries,
            'thumbnail': cover_url
        }
        return pseudo_playlist, True, "Apple Music", cover_url, url
    elif clean_title:
        url = f"ytsearch1:{clean_title} audio"
        return None, True, "Apple Music", cover_url, url
        
    return None, False, None, None, url

def extract_magic_url(url: str):
    """
    Given a URL, determines if it's a magic link (Spotify, Apple, Deezer, etc)
    and parses it.
    Returns: pseudo_playlist, is_magic, magic_source, cover_url, new_url
    """
    if "spotify.com" in url:
        try:
            return parse_spotify(url)
        except Exception as e:
            print(f"Failed to parse Spotify embed using sunnify_api: {e}")
            return None, False, None, None, url

    elif "soundcloud.com" in url and "/sets/" in url:
        try:
            return parse_soundcloud(url)
        except Exception as e:
            print(f"Failed to parse SoundCloud set: {e}")
            return None, False, None, None, url

    elif "deezer.com" in url:
        try:
            return parse_deezer(url)
        except Exception as e:
            print(f"Failed to parse Deezer link: {e}")
            return None, False, None, None, url

    elif "music.apple.com" in url:
        try:
            return parse_apple_music(url)
        except Exception as e:
            print(f"Failed to parse Apple Music link: {e}")
            return None, False, None, None, url
            
    return None, False, None, None, url
