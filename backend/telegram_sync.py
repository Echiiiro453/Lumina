import os
import requests
import threading
from database import get_setting

def send_test_message(token: str, chat_id: str) -> dict:
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": "☁️ Lumina Music: Conexão com o Telegram estabelecida com sucesso! Seus downloads agora serão salvos aqui."
    }
    try:
        r = requests.post(url, json=payload, timeout=10)
        data = r.json()
        if data.get("ok"):
            return {"success": True}
        else:
            return {"success": False, "message": data.get("description", "Erro desconhecido")}
    except Exception as e:
        return {"success": False, "message": str(e)}

def _upload_audio_thread(file_path: str, title: str, token: str, chat_id: str):
    if not os.path.exists(file_path):
        return

    # Limite da API do Telegram bot é 50MB
    file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
    if file_size_mb > 50:
        print(f"[Telegram Sync] Arquivo muito grande para upload (>50MB): {file_path}")
        return

    print(f"[Telegram Sync] Iniciando upload de: {title}")
    url = f"https://api.telegram.org/bot{token}/sendAudio"
    
    try:
        with open(file_path, "rb") as f:
            files = {"audio": (os.path.basename(file_path), f, "audio/mpeg")}
            data = {"chat_id": chat_id, "title": title}
            
            # Extrair artista do title se possivel (ex: Artista - Musica)
            parts = title.split(" - ", 1)
            if len(parts) == 2:
                data["performer"] = parts[0]
                data["title"] = parts[1]

            r = requests.post(url, data=data, files=files, timeout=600) # Timeout longo pra upload
            resp = r.json()
            if resp.get("ok"):
                print(f"[Telegram Sync] SUCESSO! Upload concluído: {title}")
            else:
                print(f"[Telegram Sync] Erro no upload: {resp.get('description')}")
    except Exception as e:
        print(f"[Telegram Sync] Exceção durante upload: {e}")

def trigger_upload_if_enabled(file_path: str, title: str):
    token = get_setting("telegram_bot_token")
    chat_id = get_setting("telegram_chat_id")
    enabled_str = get_setting("telegram_enabled")
    
    # Defaults to True if not set (for backward compatibility), but disabled if explicitly "false"
    is_enabled = True
    if enabled_str and enabled_str.lower() == "false":
        is_enabled = False
    
    if not token or not chat_id or not is_enabled:
        return # Telegram sync não configurado ou desativado
        
    # Dispara em background para não travar o loop de downloads principal
    t = threading.Thread(target=_upload_audio_thread, args=(file_path, title, token, chat_id))
    t.daemon = True
    t.start()
