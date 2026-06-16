"""
lyrics_fetcher.py
Busca e injeta letras de músicas nos arquivos de áudio após o download.
Suporta: MP3, FLAC, M4A/AAC
Providers: Musixmatch, Lrclib (via syncedlyrics)
"""
import os
import re


def _clean_title(title: str) -> str:
    """Remove suffixes like (Official Audio), (Lyrics), [HD], etc."""
    noise = [
        r'\(Official\s*(Music\s*)?Video\)',
        r'\(Official\s*Audio\)',
        r'\(Official\s*Lyric\s*Video\)',
        r'\(Official\s*Lyrics?\s*Video\)',
        r'\(Lyrics?\)',
        r'\(Letra\)',
        r'\(Audio\)',
        r'\[Official\s*(Music\s*)?Video\]',
        r'\[Official\s*Audio\]',
        r'\[Official\s*Lyric\s*Video\]',
        r'\[Official\s*Visualizer\]',
        r'\(Official\s*Visualizer\)',
        r'\[Visualizer\]',
        r'\(Visualizer\)',
        r'\[Lyrics?\]',
        r'\[HD\]',
        r'\[4K.*?\]',
        r'\(4K.*?\)',
        r'\(HQ\)',
        r'\[HQ\]',
        r'\(Explicit\)',
        r'\[Explicit\]',
        r'\(Extended\s*Mix\)',
        r'\(Radio\s*Edit\)',
        r'\(Live\)',
        r'\[Live\]',
        r'\(Slowed.*?\)',
        r'\[Slowed.*?\]',
        r'\(Sped\s*[Uu]p.*?\)',
        r'\[Sped\s*[Uu]p.*?\]',
    ]
    for pattern in noise:
        title = re.sub(pattern, '', title, flags=re.IGNORECASE)
    return title.strip(' -–—|')



def _build_search_query(title: str, artist: str) -> str:
    """
    Build a clean search query, avoiding duplicate artist names.
    If the artist name is already present in the title, use title only.
    """
    clean = _clean_title(title)
    
    if artist:
        # Normalize both for comparison
        title_lower = clean.lower()
        artist_lower = artist.lower().strip()
        
        # Check if artist name is already somewhere in the title
        if artist_lower and artist_lower in title_lower:
            return clean
        else:
            return f"{artist} {clean}".strip()
    
    return clean

def _fetch_from_musixmatch_custom(search_term: str) -> str:
    """
    Falsifica a assinatura do aplicativo Desktop Oficial do Musixmatch para 
    gerar um token inviolavel e buscar a letra em milissegundos sem erro 401.
    """
    import time
    from curl_cffi import requests
    from config import CHROME_IMPERSONATE
    
    try:
        t_millis = int(time.time() * 1000)
        url_token = f"https://apic-desktop.musixmatch.com/ws/1.1/token.get?user_language=en&app_id=web-desktop-app-v1.0&t={t_millis}"
        res_token = requests.get(url_token, impersonate=CHROME_IMPERSONATE, timeout=10)
        data = res_token.json()
        
        if data['message']['header']['status_code'] == 200:
            token = data['message']['body']['user_token']
            
            import urllib.parse
            url_search = f"https://apic-desktop.musixmatch.com/ws/1.1/track.search?q={urllib.parse.quote(search_term)}&page_size=1&page=1&app_id=web-desktop-app-v1.0&usertoken={token}&t={t_millis}"
            res_search = requests.get(url_search, impersonate=CHROME_IMPERSONATE, timeout=10)
            search_data = res_search.json()
            
            if search_data['message']['header']['status_code'] == 200:
                track_list = search_data['message']['body']['track_list']
                if track_list:
                    track_id = track_list[0]['track']['track_id']
                    
                    url_sync = f"https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?track_id={track_id}&subtitle_format=lrc&app_id=web-desktop-app-v1.0&usertoken={token}&t={t_millis}"
                    res_sync = requests.get(url_sync, impersonate=CHROME_IMPERSONATE, timeout=10)
                    sync_data = res_sync.json()
                    
                    if sync_data['message']['header']['status_code'] == 200:
                        return sync_data['message']['body']['subtitle']['subtitle_body']
    except Exception as e:
        print(f"  [lyrics:warn] Musixmatch custom engine falhou: {e}")
        
    return None

def fetch_and_embed_lyrics(file_path: str, title: str, artist: str = '') -> bool:
    """
    Busca a letra da música e embute no arquivo de áudio.
    Retorna True se conseguiu injetar a letra, False caso contrário.
    """
    if not file_path or not os.path.exists(file_path):
        return False

    ext = os.path.splitext(file_path)[1].lower()
    if ext not in ('.mp3', '.flac', '.m4a', '.aac', '.ogg'):
        return False

    try:
        import syncedlyrics
    except ImportError:
        print("  [lyrics] syncedlyrics nao instalado, pulando.")
        return False

    search_query = _build_search_query(title, artist)
    print(f"  [lyrics] Buscando letra: '{search_query}'")

    lyrics_text = None

    # 1. Tenta o nosso motor customizado imune a 401
    print(f"  [lyrics] Tentando motor silencioso Musixmatch VIP...")
    lyrics_text = _fetch_from_musixmatch_custom(search_query)
    if lyrics_text:
        print(f"  [lyrics] Letra sincronizada encontrada pelo motor Musixmatch VIP!")
    else:
        print(f"  [lyrics] Musixmatch bloqueou o acesso. Acionando Fallbacks Asiáticos...")

    # 2. Fallback para Biblioteca de Terceiros (Asia + Lrclib)
    if not lyrics_text:
        providers = ["Lrclib", "NetEase", "Megalobiz", "Kugou"]
        try:
            lyrics_text = syncedlyrics.search(search_query, providers=providers)
            if lyrics_text:
                print(f"  [lyrics] Letra sincronizada encontrada (Asia/Lrclib)!")
        except Exception:
            pass

    if not lyrics_text:
        try:
            lyrics_text = syncedlyrics.search(search_query, providers=providers, plain_only=True)
            if lyrics_text:
                print(f"  [lyrics] Letra simples encontrada no LRCLIB.")
        except Exception:
            pass

    # 3. FALLBACK: Raspador Genius!
    if not lyrics_text:
        print(f"  [lyrics] Todos falharam. Acionando raspador do Genius para: '{search_query}'")
        try:
            from curl_cffi import requests as curl_req
            from bs4 import BeautifulSoup
            
            # 1. Pesquisa na API invisível do Genius
            search_api = f"https://genius.com/api/search/multi?per_page=1&q={search_query}"
            from config import CHROME_IMPERSONATE
            res = curl_req.get(search_api, impersonate=CHROME_IMPERSONATE, timeout=10)
            data = res.json()
            
            # Encontra a URL da letra
            hits = data.get("response", {}).get("sections", [])[0].get("hits", [])
            if hits:
                song_url = hits[0].get("result", {}).get("url")
                if song_url:
                    # 2. Raspa o HTML real para contornar a segurança deles
                    page_res = curl_req.get(song_url, impersonate=CHROME_IMPERSONATE, timeout=10)
                    soup = BeautifulSoup(page_res.text, "html.parser")
                    lyrics_divs = soup.find_all("div", {"data-lyrics-container": "true"})
                    
                    if lyrics_divs:
                        extracted_text = []
                        for div in lyrics_divs:
                            # Adiciona quebras de linha limpas
                            extracted_text.append(div.get_text(separator="\n"))
                        
                        lyrics_text = "\n".join(extracted_text)
                        print(f"  [lyrics] Sucesso! Letra extraída à força do Genius!")
        except Exception as e:
            print(f"  [lyrics] Genius raspador falhou: {e}")

    if not lyrics_text:
        print(f"  [lyrics] Letra nao encontrada em nenhum lugar para: '{search_query}'")
        return False

    return _embed_lyrics(file_path, ext, lyrics_text)



def _embed_lyrics(file_path: str, ext: str, lyrics_text: str) -> bool:
    """Embeds lyrics into the audio file using mutagen."""
    try:
        if ext == '.mp3':
            from mutagen.mp3 import MP3
            from mutagen.id3 import ID3, USLT, Encoding
            audio = MP3(file_path, ID3=ID3)
            if audio.tags is None:
                audio.add_tags()
            audio.tags.delall('USLT')
            audio.tags.add(USLT(
                encoding=Encoding.UTF8,
                lang='und',
                desc='Lyrics',
                text=lyrics_text
            ))
            audio.save()
            print(f"  [lyrics] OK Letra injetada no MP3")
            return True

        elif ext == '.flac':
            from mutagen.flac import FLAC
            audio = FLAC(file_path)
            audio['LYRICS'] = lyrics_text
            audio.save()
            print(f"  [lyrics] OK Letra injetada no FLAC")
            return True

        elif ext in ('.m4a', '.aac'):
            from mutagen.mp4 import MP4
            audio = MP4(file_path)
            audio['\xa9lyr'] = [lyrics_text]
            audio.save()
            print(f"  [lyrics] OK Letra injetada no M4A")
            return True

    except Exception as e:
        print(f"  [lyrics] Erro ao injetar letra: {e}")

    return False


def _strip_lrc_timestamps(lrc_text: str) -> str:
    """Removes LRC timestamp tags, leaving only plain lyric lines."""
    lines = lrc_text.splitlines()
    plain_lines = []
    for line in lines:
        clean = re.sub(r'^\[\d{2}:\d{2}[.:]\d{2,3}\]\s*', '', line)
        # Skip metadata tags like [ar:Artist], [ti:Title]
        if re.match(r'^\[.*:.*\]$', clean.strip()):
            continue
        plain_lines.append(clean)
    return '\n'.join(plain_lines).strip()
