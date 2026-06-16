import os
import sys
import asyncio
import time

sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'backend'))

print("=== INICIANDO TESTE COMPLETO DOS MOTORES (READ-ONLY) ===")

# 1. Testando Spotify Parser
print("\n[1] Testando Spotify Parser (magic_parsers.py)...")
try:
    from magic_parsers import extract_magic_url
    spotify_url = "https://open.spotify.com/track/3n3Ppam7vgaBg1s4HdM4Va"
    res = extract_magic_url(spotify_url)
    if res:
        pseudo_playlist, is_magic, magic_source, cover_url, new_url = res
        print(f"  [SUCESSO] Spotify Parse OK!")
        print(f"  URL traduzida do YT: {new_url}")
        print(f"  Magic Source: {magic_source}")
    else:
        print("  [FALHA] extract_magic_url retornou None")
except Exception as e:
    print(f"  [ERRO EXCEÇÃO]: {e}")

# 2. Testando Lyrics Fetcher
print("\n[2] Testando Buscador de Letras (lyrics_fetcher.py)...")
try:
    import syncedlyrics
    query = "Daft Punk Get Lucky"
    print(f"  Buscando letra para: {query}")
    lyrics = syncedlyrics.search(query, providers=["Lrclib", "Musixmatch"])
    if lyrics:
        print("  [SUCESSO] Letra encontrada!")
        print(f"  Trecho: {lyrics[:100]}...")
    else:
        print("  [FALHA] Letra não encontrada.")
except Exception as e:
    print(f"  [ERRO EXCEÇÃO]: {e}")

# 3. Testando Youtube Metadata (via yt-dlp sem download)
print("\n[3] Testando Extrator Youtube (yt-dlp)...")
try:
    import yt_dlp
    from utils import get_cookies_path
    opts = {
        'quiet': True,
        'extract_flat': True,
        'no_warnings': True,
        'cookiefile': get_cookies_path()
    }
    start = time.time()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info("ytsearch1:Rick Astley Never Gonna Give You Up", download=False)
        if 'entries' in info and len(info['entries']) > 0:
            entry = info['entries'][0]
            print(f"  [SUCESSO] Youtube Busca OK!")
            print(f"  Vídeo Encontrado: {entry.get('title')}")
            print(f"  Duração: {entry.get('duration')}s")
        else:
            print("  [FALHA] Nenhum resultado do YT.")
    print(f"  Tempo de resposta do YT: {time.time() - start:.2f}s")
except Exception as e:
    print(f"  [ERRO EXCEÇÃO]: {e}")

# 4. Testando Isolamento da Twitch (Aria2c bypass)
print("\n[4] Testando Desativação do Aria2c para Twitch...")
try:
    from downloader import build_ydl_opts
    class DummyRequest:
        url = "https://www.twitch.tv/gaules"
        playlist = False
        mode = "audio"
        quality = "best"
        subtitle = "none"
        cover_path = None
        sponsorblock_enabled = False
        organize = False
        organize_by_playlist = False
        video_codec = "auto"

    opts = build_ydl_opts("test", DummyRequest())
    if "external_downloader" in opts:
        print(f"  [FALHA] Aria2c ESTÁ ATIVADO para a Twitch! -> {opts['external_downloader']}")
    else:
        print("  [SUCESSO] Aria2c não foi ativado para URL da Twitch. O bypass funciona.")
        
    class DummyRequest2:
        url = "https://www.youtube.com/watch?v=123"
        playlist = False
        mode = "audio"
        quality = "best"
        subtitle = "none"
        cover_path = None
        sponsorblock_enabled = False
        organize = False
        organize_by_playlist = False
        video_codec = "auto"
        
    opts2 = build_ydl_opts("test2", DummyRequest2())
    if "external_downloader" in opts2:
        print(f"  [SUCESSO] Aria2c ESTÁ ATIVADO para Youtube. -> {opts2['external_downloader']}")
    else:
        print("  [FALHA] Aria2c não foi ativado para o YouTube. Há algo errado.")
        
except Exception as e:
    print(f"  [ERRO EXCEÇÃO]: {e}")

print("\n=== FIM DOS TESTES ===")
