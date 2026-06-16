import time
from curl_cffi import requests
import re

def benchmark():
    url = "https://music.apple.com/us/playlist/top-100-global/pl.d25f5d1181894928af76c85c967f8f31"
    
    start_time = time.time()
    print("Iniciando requisição...")
    
    session = requests.Session(impersonate="chrome120")
    res = session.get(url)
    fetch_time = time.time() - start_time
    print(f"Tempo de download HTML: {fetch_time:.2f} segundos")
    
    html = res.text
    parse_start = time.time()
    
    matches = re.findall(r'"artistName":"([^"]+)".*?"name":"([^"]+)"', html)
    unique_m = []
    seen = set()
    for m in matches:
        if m not in seen:
            seen.add(m)
            unique_m.append(m)
            
    parse_time = time.time() - parse_start
    total_time = time.time() - start_time
    
    print(f"Tempo de parsing (Regex): {parse_time:.4f} segundos")
    print(f"Tempo total: {total_time:.2f} segundos")
    print(f"Músicas extraídas: {len(unique_m)}")

benchmark()
