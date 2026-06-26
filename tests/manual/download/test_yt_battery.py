import os
import sys
import time

# Adicionar backend ao path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
try:
    from utils import get_cookies_path, get_data_dir
except ImportError:
    # Fallback se não conseguir importar
    def get_cookies_path():
        return os.path.join(os.path.dirname(__file__), 'backend', 'cookies.txt')
    def get_data_dir():
        return os.path.join(os.path.dirname(__file__), 'backend')

import yt_dlp

VIDEO_URL = "https://www.youtube.com/watch?v=rpk59gQBRWU"

def run_test(use_cookies, js_engine):
    print(f"\n{'='*50}")
    print(f"TESTE: Cookies={use_cookies} | Engine={js_engine}")
    print(f"{'='*50}")
    
    opts = {
        'quiet': True,
        'extract_flat': 'in_playlist',
        'no_warnings': True,
        'remote_components': ['ejs:github']
    }
    
    if use_cookies:
        cookie_path = get_cookies_path()
        if os.path.exists(cookie_path):
            opts['cookiefile'] = cookie_path
        else:
            print("  (Aviso: cookies.txt não encontrado!)")
            
    if js_engine == 'node':
        opts['js_runtimes'] = {'node': {}}
    elif js_engine == 'deno':
        deno_path = os.path.join(get_data_dir(), 'deno', 'deno.exe')
        opts['js_runtimes'] = {'deno': {'path': deno_path}}
        
    start_time = time.time()
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(VIDEO_URL, download=False)
            title = info.get('title', 'Unknown').encode('ascii', 'ignore').decode('ascii')
            print(f"  [SUCESSO] Vídeo: {title}")
    except Exception as e:
        err_msg = str(e).split('\n')[0]
        print(f"  [FALHA] Erro: {err_msg}")
        
    elapsed = time.time() - start_time
    print(f"  Tempo decorrido: {elapsed:.2f}s")

if __name__ == "__main__":
    # Testar combinações com cookies
    run_test(use_cookies=True, js_engine=None)
    run_test(use_cookies=True, js_engine='node')
    run_test(use_cookies=True, js_engine='deno')
    
    # Testar combinações sem cookies
    run_test(use_cookies=False, js_engine=None)
    run_test(use_cookies=False, js_engine='node')
    run_test(use_cookies=False, js_engine='deno')
