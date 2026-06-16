import subprocess
import json

VIDEO_ID = "dQw4w9WgXcQ"

clients_to_test = [
    "tv_embedded",
    "web_embedded",
    "web_creator",
    "tv_unplugged",
    "web_safari",
    "web_music",
    "mweb"
]

print("=== TESTE DE CLIENTES AVANÇADOS COM YT-DLP ===\n")

for client in clients_to_test:
    print(f"[*] Testando cliente: {client}...")
    cmd = [
        "python", "-m", "yt_dlp",
        "--dump-json",
        "--extractor-args", f"youtube:player_client=[{client}]",
        f"https://www.youtube.com/watch?v={VIDEO_ID}"
    ]
    
    try:
        CREATE_NO_WINDOW = 0x08000000
        process = subprocess.run(cmd, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
        
        if process.returncode == 0:
            data = json.loads(process.stdout)
            
            # Find max resolution
            formats = data.get("formats", [])
            max_res = 0
            for f in formats:
                height = f.get("height")
                if height and height > max_res:
                    max_res = height
            
            print(f"  -> SUCESSO! Vídeo extraído.")
            print(f"  -> Qualidade Máxima de Vídeo Encontrada: {max_res}p")
        else:
            # Extract error message
            err_msg = process.stderr.strip().split('\n')[-1]
            if "Sign in to confirm you're not a bot" in err_msg:
                print(f"  -> FALHOU: Bloqueado por Proteção Anti-Bot (Exige Login/Cookies)")
            elif "Sign in to confirm your age" in err_msg:
                print(f"  -> FALHOU: Restrição de Idade")
            else:
                print(f"  -> FALHOU: {err_msg}")
    except Exception as e:
        print(f"  -> ERRO DE EXECUÇÃO: {e}")
    print("-" * 50)

print("\n=== FIM DOS TESTES ===")
