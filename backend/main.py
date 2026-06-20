from fastapi import FastAPI, HTTPException, Request, File, UploadFile, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
import os
import sys
import json
import time
import uuid
import shutil
import asyncio
import tempfile
import zipfile
import threading

# EXPERIMENTAL: Forçando importação para o PyInstaller rastrear o Demucs/Shazam
try:
    import demucs
    import torch
    import torchaudio
    import shazamio
    import register_windows
except ImportError:
    pass

# SECRET CLI INTERCEPT FOR DEMUCS:
# This allows the compiled Lumina.exe to act as the "demucs" CLI
if len(sys.argv) > 1 and sys.argv[1] == "--run-demucs":
    import demucs.separate
    # Pass all arguments after --run-demucs to demucs
    # e.g. Lumina.exe --run-demucs file.mp3 -n htdemucs_6s ...
    demucs.separate.main(sys.argv[2:])
    sys.exit(0)

# SECRET CLI INTERCEPT FOR SPOTIFY:
# Run spotipy fetching in a completely isolated process to prevent crashes
if len(sys.argv) > 1 and sys.argv[1] == "--run-spotify":
    try:
        from magic_parsers import _spotipy_fetch
        url_type = sys.argv[2]
        item_id = sys.argv[3]
        res = _spotipy_fetch(url_type, item_id)
        # Retorna o JSON da tupla resultante. Se der erro, captura na exception
        print(json.dumps(res))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
    sys.exit(0)

import collections
from datetime import datetime
from urllib.request import Request as URLRequest, urlopen
import re
import yt_dlp
from dataclasses import asdict

from utils import get_base_dir, get_resource_path, get_data_dir, get_downloads_dir, get_cookies_path
from database import init_db, get_conn, get_downloaded_ids, mark_missing_db, get_download_record, sync_db_with_disk, add_favorite, remove_favorite, get_favorites, is_favorite
from voice_engine import VoiceEngine
from downloader import jobs, download_queue, worker_loop, MAX_CONCURRENT_DOWNLOADS, JobState
from urllib.parse import urlparse

app = FastAPI()

from routers.downloads import router as downloads_router
from routers.library import router as library_router
from routers.settings import router as settings_router
from routers.mobile import router as mobile_router
from routers.studio import router as studio_router
from routers.stream import router as stream_router

app.include_router(downloads_router)
app.include_router(library_router)
app.include_router(settings_router)
app.include_router(mobile_router)
app.include_router(studio_router)
app.include_router(stream_router)


origins = ["http://localhost:5173", "http://localhost:3000", "http://localhost:8000", "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_json(self, data: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except:
                pass

manager = ConnectionManager()

# --- VOICE ENGINE INTEGRATION ---
import asyncio

main_loop = None

# O loop é inicializado no evento startup principal

def on_voice_command(action_data):
    try:
        if main_loop:
            asyncio.run_coroutine_threadsafe(manager.broadcast_json(action_data), main_loop)
    except Exception as e:
        print(f"Voice trigger error: {e}")

voice_engine = VoiceEngine(on_voice_command)
# --------------------------------


APP_VERSION = "4.1.0"
GITHUB_REPO = "Echiiiro453/youtubeMusicDownload"

log_buffer = collections.deque(maxlen=500)

class LogInterceptor:
    def __init__(self, original_stream):
        self.original_stream = original_stream

    def write(self, text):
        self.original_stream.write(text)
        if text.strip():
            # Remove ANSI color codes for the web viewer
            clean_text = re.sub(r'\x1b\[[0-9;]*m', '', text)
            # Filter known harmless yt-dlp noise to keep the UI log clean
            _noise = [
                'No supported JavaScript runtime could be found',
                'Only deno is enabled by default',
                'YouTube extraction without a JS runtime has been deprecated',
                'js-runtimes RUNTIME[:PATH]',
                'yt-dlp/wiki/EJS',
                'Skipping unsupported client "tv_embedded"',
                'Skipping unsupported client "web_embedded"',
            ]
            if any(n in clean_text for n in _noise):
                return
            log_buffer.append(clean_text)

    def flush(self):
        self.original_stream.flush()
        
    def __getattr__(self, attr):
        return getattr(self.original_stream, attr)

sys.stdout = LogInterceptor(sys.stdout)
sys.stderr = LogInterceptor(sys.stderr)

@app.get("/api/logs")
async def get_logs():
    return {"logs": list(log_buffer)}

@app.get("/api/db/sync")
async def sync_db():
    """Syncs the DB with disk, marking deleted files as 'missing'."""
    from utils import get_downloads_dir
    result = sync_db_with_disk(get_downloads_dir())
    return {"status": "ok", **result}

@app.get("/version")
async def get_version():
    return {"version": APP_VERSION}

class TelemetryData(BaseModel):
    source: str
    message: str
    level: str = "info"

@app.post("/api/telemetry")
async def api_telemetry(data: TelemetryData):
    """
    Recebe logs em tempo real do frontend (DSP/React) e imprime no CMD.
    Útil para debugar a pipeline de áudio sem precisar abrir o DevTools (F12).
    """
    colors = {
        "info": "\033[96m",   # Ciano
        "warn": "\033[93m",   # Amarelo
        "error": "\033[91m",  # Vermelho
        "success": "\033[92m" # Verde
    }
    reset = "\033[0m"
    color = colors.get(data.level, reset)
    
    print(f"{color}[{data.source.upper()}] {data.message}{reset}")
    return {"status": "ok"}

@app.get("/check_update")
async def check_update():
    import urllib.request
    import json
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest",
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            latest_version = data.get("tag_name", "").replace("v", "")
            
            # Simple version comparison (assumes format x.y.z)
            current_parts = [int(p) for p in APP_VERSION.split(".")]
            latest_parts = [int(p) for p in latest_version.split(".")]
            
            update_available = False
            for i in range(max(len(current_parts), len(latest_parts))):
                c = current_parts[i] if i < len(current_parts) else 0
                l = latest_parts[i] if i < len(latest_parts) else 0
                if l > c:
                    update_available = True
                    break
                elif c > l:
                    break

            return {
                "update_available": update_available,
                "current_version": APP_VERSION,
                "latest_version": latest_version,
                "release_notes": data.get("body", "Sem notas de lançamento disponíveis."),
                "download_url": data.get("html_url", f"https://github.com/{GITHUB_REPO}/releases/latest")
            }
    except Exception as e:
        print(f"Update check failed: {e}")
        return {"update_available": False, "error": str(e)}
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    import os
    if "LUMINA_INITIAL_FILE" in os.environ:
        try:
            await websocket.send_json({"type": "PLAY_EXTERNAL", "file_path": os.environ["LUMINA_INITIAL_FILE"]})
            del os.environ["LUMINA_INITIAL_FILE"]
        except Exception:
            pass
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

async def ws_broadcast_loop():
    while True:
        await asyncio.sleep(1)
        if manager.active_connections:
            jobs_data = {job_id: asdict(state) for job_id, state in jobs.items()}
            await manager.broadcast_json(jobs_data)

bgutil_process = None

@app.on_event("startup")
async def startup_event():
    global main_loop, bgutil_process
    main_loop = asyncio.get_running_loop()
    
    init_db()
    
    # Start BGUtil Node Server
    try:
        import subprocess
        from utils import get_resource_path, get_data_dir
        
        server_dir = get_resource_path("bgutil_server")
        server_path = os.path.join(server_dir, "build", "main.js")
        
        node_exe = get_resource_path("node.exe")
        if not os.path.exists(node_exe):
            node_exe = "node"
            
        log_path = os.path.join(get_data_dir(), "bgutil_node.log")
        log_file = open(log_path, "w")
        
        # Ocultar janela no Windows
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        bgutil_process = subprocess.Popen(
            [node_exe, server_path],
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=server_dir,
            creationflags=CREATE_NO_WINDOW
        )
        print("[Startup] BGUtil PO Token Server started on port 4416")
    except Exception as e:
        print(f"[Startup] Error starting BGUtil Server: {e}")
    
    # Initialize download_sem from database so it respects the saved user settings on boot
    import downloader
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'concurrent_downloads'")
        row = cur.fetchone()
        conn.close()
        if row:
            value = max(1, min(8, int(row['value'])))
            downloader.download_sem = asyncio.Semaphore(value)
            print(f"[Startup] Concurrent downloads restored to {value}")
    except Exception as e:
        print(f"[Startup] Error loading concurrent downloads setting: {e}")

    for _ in range(20):
        asyncio.create_task(worker_loop())
    asyncio.create_task(ws_broadcast_loop())
    
    # Start Playlist Monitor
    try:
        import subscriptions
        subscriptions.start_monitor()
        print("[Startup] Playlist Monitor started")
    except Exception as e:
        print(f"[Startup] Error starting Playlist Monitor: {e}")

    try:
        import keyboard
        import webview
        
        # Le o atalho salvo do banco de dados
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'miniplayer_hotkey'")
        row = cur.fetchone()
        conn.close()
        
        global current_miniplayer_hotkey
        if row and row[0]:
            current_miniplayer_hotkey = row[0]
            
        keyboard.add_hotkey(current_miniplayer_hotkey, toggle_miniplayer)
        print(f"[Startup] Hotkey {current_miniplayer_hotkey} registered for Mini Player")
    except Exception as e:
        print(f"[Startup] Error registering hotkey: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    global bgutil_process
    if bgutil_process:
        try:
            bgutil_process.terminate()
            print("[Shutdown] BGUtil PO Token Server terminated")
        except:
            pass


class InfoRequest(BaseModel):
    url: str
    limit: int = 50


class RetryRequest(BaseModel):
    playlist_id: str
    video_id: str

@app.get("/download/jobs")
async def get_all_jobs():
    return {job_id: asdict(state) for job_id, state in jobs.items()}

# --- Subscriptions API ---
import subscriptions

class SubscriptionRequest(BaseModel):
    playlist_id: Optional[str] = None
    url: str
    title: str
    platform: str

@app.get("/api/subscriptions")
def api_get_subscriptions():
    return subscriptions.get_all_subscriptions()

@app.post("/api/subscriptions/add")
def api_add_subscription(req: SubscriptionRequest):
    p_id = req.playlist_id if req.playlist_id else req.url
    success = subscriptions.add_subscription(p_id, req.url, req.title, req.platform)
    if success:
        return {"success": True, "message": "Inscrito com sucesso"}
    return {"success": False, "message": "Já inscrito nesta playlist"}

@app.post("/api/subscriptions/remove")
def api_remove_subscription(req: dict):
    playlist_id = req.get("playlist_id")
    if playlist_id:
        subscriptions.remove_subscription(playlist_id)
        return {"success": True}
    raise HTTPException(status_code=400, detail="Missing playlist_id")

@app.get("/api/subscriptions/{playlist_id:path}/downloads")
def api_get_subscription_downloads(playlist_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT video_id, title, file_path, created_at, status FROM downloads WHERE playlist_id = ? ORDER BY created_at DESC", (playlist_id,))
        rows = cur.fetchall()
        conn.close()
        downloads = []
        for r in rows:
            downloads.append({
                "video_id": r["video_id"],
                "title": r["title"],
                "file_path": r["file_path"],
                "created_at": r["created_at"],
                "status": r["status"]
            })
        return downloads
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Favorites API ---
class FavoriteRequest(BaseModel):
    video_id: str
    title: str
    file_path: str

@app.get("/api/favorites")
def api_get_favorites():
    return {"favorites": get_favorites()}

@app.post("/api/favorites/add")
def api_add_favorite(req: FavoriteRequest):
    added = add_favorite(req.video_id, req.title, req.file_path)
    return {"success": True, "added": added}

@app.delete("/api/favorites/{video_id}")
def api_remove_favorite(video_id: str):
    remove_favorite(video_id)
    return {"success": True}

@app.get("/api/favorites/check/{video_id}")
def api_is_favorite(video_id: str):
    return {"is_favorite": is_favorite(video_id)}

# --- Tag Editor API ---
import tag_editor as _tag_editor
import miniplayer as _miniplayer

app.include_router(_miniplayer.router)

current_miniplayer_hotkey = "ctrl+shift+m"
miniplayer_visible = [True]

def toggle_miniplayer():
    import webview
    for w in webview.windows:
        if w.title == "Lumina Mini":
            if miniplayer_visible[0]:
                w.hide()
                miniplayer_visible[0] = False
            else:
                w.show()
                miniplayer_visible[0] = True
            return
    api_open_miniplayer()
    miniplayer_visible[0] = True

@app.post("/api/miniplayer/open")
def api_open_miniplayer():
    import webview
    try:
        # Check if already exists to prevent duplicates
        for w in webview.windows:
            if w.title == "Lumina Mini":
                w.show()
                return {"success": True}
        webview.create_window(
            "Lumina Mini", 
            "http://localhost:8000/miniplayer", 
            width=380, 
            height=100, 
            frameless=True, 
            on_top=True, 
            resizable=False,
            background_color="#09090b"
        )
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

class TagWriteRequest(BaseModel):
    file_path: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    lyrics: Optional[str] = None
    cover_base64: Optional[str] = None

class FetchLyricsRequest(BaseModel):
    file_path: str
    title: str
    artist: Optional[str] = ""

@app.get("/api/tags/read")
def api_read_tags(file_path: str):
    return _tag_editor.read_tags(file_path)

@app.post("/api/tags/save")
def api_write_tags(req: TagWriteRequest):
    data = {k: v for k, v in req.dict().items() if v is not None and k != "file_path"}
    result = _tag_editor.write_tags(req.file_path, data)
    
    if result.get("success") and result.get("new_path"):
        new_path = result["new_path"]
        if new_path != req.file_path:
            # Update path in database
            conn = get_conn()
            cur = conn.cursor()
            cur.execute("UPDATE downloads SET file_path = ?, title = ? WHERE file_path = ?", 
                        (new_path, req.title or data.get("title", ""), req.file_path))
            conn.commit()
            conn.close()
            
    return result

@app.post("/api/tags/fetch_lyrics")
def api_fetch_lyrics_for_file(req: FetchLyricsRequest):
    """Busca a letra sem gravar — retorna o texto para o usuario confirmar."""
    try:
        import syncedlyrics
        from lyrics_fetcher import _build_search_query, _clean_title
        query = _build_search_query(req.title, req.artist)
        lyrics = None
        try:
            lyrics = syncedlyrics.search(query, providers=["Lrclib", "Musixmatch", "NetEase"])
        except Exception as e:
            print(f"Erro syncedlyrics Lrclib/Musixmatch: {e}")
        if not lyrics:
            try:
                lyrics = syncedlyrics.search(query, providers=["Lrclib", "Musixmatch"], plain_only=True)
            except Exception as e:
                print(f"Erro syncedlyrics plain: {e}")
        if not lyrics:
            # Fallback Genius
            from curl_cffi import requests as curl_req
            from bs4 import BeautifulSoup
            from config import CHROME_IMPERSONATE
            res = curl_req.get(f"https://genius.com/api/search/multi?per_page=1&q={query}", impersonate=CHROME_IMPERSONATE, timeout=10)
            data = res.json()
            hits = data.get("response", {}).get("sections", [])[0].get("hits", [])
            if hits:
                song_url = hits[0].get("result", {}).get("url")
                if song_url:
                    page_res = curl_req.get(song_url, impersonate=CHROME_IMPERSONATE, timeout=10)
                    soup = BeautifulSoup(page_res.text, "html.parser")
                    divs = soup.find_all("div", {"data-lyrics-container": "true"})
                    if divs:
                        lyrics = "\n".join(d.get_text(separator="\n") for d in divs)
        if lyrics:
            return {"success": True, "lyrics": lyrics}
        return {"success": False, "message": "Letra nao encontrada"}
    except Exception as e:
        return {"success": False, "message": str(e)}

@app.get("/presets")
def get_presets():
    custom_presets = []
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'custom_presets'")
        row = cur.fetchone()
        conn.close()
        if row and row[0]:
            import json
            custom_presets = json.loads(row[0])
    except:
        pass
        
    return {
        "defaults": [
            {'name': 'Nightcore', 'pitch': 3, 'speed': 1.15},
            {'name': 'Slowed + Reverb', 'pitch': -2, 'speed': 0.85},
            {'name': 'Daycore', 'pitch': -1, 'speed': 0.9},
            {'name': 'Double Time', 'pitch': 0, 'speed': 1.5},
            {'name': 'Half Time', 'pitch': 0, 'speed': 0.75}
        ],
        "custom": custom_presets
    }

class PresetData(BaseModel):
    name: str
    pitch: float
    speed: float
    eq: str = 'normal'

@app.post("/presets")
def save_preset(preset: PresetData):
    custom_presets = []
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'custom_presets'")
        row = cur.fetchone()
        if row and row[0]:
            import json
            custom_presets = json.loads(row[0])
            
        # Add new preset or update existing
        new_preset = {
            "name": preset.name,
            "pitch": preset.pitch,
            "speed": preset.speed,
            "eq": preset.eq
        }
        
        custom_presets = [p for p in custom_presets if p["name"] != preset.name]
        custom_presets.append(new_preset)
        
        import json
        cur.execute("""
            INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
        """, ('custom_presets', json.dumps(custom_presets)))
        conn.commit()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


import functools

@functools.lru_cache(maxsize=32)
def parse_magic_url(url: str):
    from magic_parsers import extract_magic_url
    res = extract_magic_url(url)
    if res:
        pseudo_playlist, is_magic, magic_source, cover_url, new_url = res
        return new_url, pseudo_playlist, is_magic, magic_source, cover_url
    return url, None, False, None, None

def clean_url(url: str) -> str:
    import urllib.parse
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        for param in ["si", "pp", "utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"]:
            qs.pop(param, None)
        new_query = urllib.parse.urlencode(qs, doseq=True)
        return urllib.parse.urlunparse(parsed._replace(query=new_query))
    except:
        return url







@app.post("/open_folder")
def open_folder():
    downloads_dir = get_downloads_dir()
    if os.path.exists(downloads_dir): os.startfile(downloads_dir)
    return {"status": "opened"}



class RadioRequest(BaseModel):
    seed_title: str

@app.post("/api/radio/next")
def api_radio_next(req: RadioRequest):
    import yt_dlp
    import random
    
    # We use ytsearch5 to get a mix of results and pick a random one
    # to simulate "infinite radio" without playing the same track over and over
    opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'extract_flat': False,
        'cookiefile': get_cookies_path()
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            # We search "{seed} mix auto-generated" or "audio" to get similar songs
            info = ydl.extract_info(f"ytsearch5:{req.seed_title} audio", download=False)
            if 'entries' in info and len(info['entries']) > 0:
                # Pick a random entry
                entry = random.choice(info['entries'])
                return {
                    "status": "success",
                    "title": entry.get('title'),
                    "url": entry.get('url'),
                    "video_id": entry.get('id'),
                    "thumbnail": entry.get('thumbnail') or f"https://i.ytimg.com/vi/{entry.get('id')}/mqdefault.jpg"
                }
            return {"status": "error", "detail": "No similar tracks found"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/auth_status")
def get_auth_status():
    cookie_path = get_cookies_path()
    if not cookie_path or not os.path.exists(cookie_path) or os.path.getsize(cookie_path) == 0:
        return {"authenticated": False}
    
    # Valida o formato Netscape básico
    try:
        with open(cookie_path, 'r', encoding='utf-8') as f:
            content = f.read(1024)
            if "# Netscape HTTP Cookie File" in content or "# HTTP Cookie File" in content:
                return {"authenticated": True}
    except Exception:
        pass
        
    return {"authenticated": False}

@app.post("/upload_cookies")
async def upload_cookies(file: UploadFile = File(...)):
    try:
        print(f"[Upload] Recebendo arquivo de cookies: {file.filename}")
        cookie_path = os.path.join(get_data_dir(), "cookies.txt")
        print(f"[Upload] Salvando em: {cookie_path}")
        
        with open(cookie_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        print("[Upload] Cookies salvos com sucesso!")
        return {"status": "success"}
    except Exception as e:
        print(f"[Upload] Erro ao salvar cookies: {e}")
        raise HTTPException(status_code=500, detail=f"Erro no servidor: {str(e)}")

@app.get("/terms/status")
def get_terms_status():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'terms_accepted_v3'")
        row = cur.fetchone()
        conn.close()
        return {"accepted": row['value'] == 'true' if row else False}
    except: return {"accepted": False}

@app.post("/terms/accept")
def accept_terms():
    conn = get_conn()
    cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('terms_accepted_v3', 'true')")
    conn.commit()
    conn.close()
    return {"status": "ok"}

@app.get("/terms/content")
def get_terms_content():
    path = get_resource_path("TERMS.md")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f: return {"content": f.read()}
    return {"content": "Termos de Uso Padrão"}









@app.post("/api/choose_file")
def choose_file():
    try:
        import webview
        if webview.windows:
            window = webview.windows[0]
            result = window.create_file_dialog(
                webview.OPEN_DIALOG,
                allow_multiple=False,
                file_types=('Audio Files (*.mp3;*.wav;*.m4a;*.flac)', 'All Files (*.*)')
            )
            if result and len(result) > 0:
                return {"status": "ok", "file": result[0]}
        return {"status": "error", "message": "Nenhuma janela ativa ou ação cancelada."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

class ConvertRequest(BaseModel):
    input_path: str
    output_format: str

@app.post("/api/convert")
async def convert_file(request: ConvertRequest):
    try:
        from utils import get_downloads_dir
        input_path = request.input_path
        if not os.path.exists(input_path):
            raise HTTPException(status_code=404, detail="Arquivo original não encontrado.")

        downloads_dir = get_downloads_dir()
        filename = os.path.basename(input_path)
        name, _ = os.path.splitext(filename)
        output_filename = f"{name}.{request.output_format.lower()}"
        output_path = os.path.join(downloads_dir, output_filename)

        # Check if ffmpeg exists in root
        ffmpeg_path = os.path.join(get_base_dir(), "ffmpeg.exe")
        if not os.path.exists(ffmpeg_path):
            ffmpeg_path = "ffmpeg" # Fallback to system ffmpeg

        cmd = [
            ffmpeg_path,
            "-y",
            "-i", input_path,
        ]
        
        is_audio = request.output_format.lower() in ['mp3', 'wav', 'flac', 'm4a', 'ogg']
        if is_audio:
            cmd.append("-vn") # No video
            
        if request.output_format.lower() == 'mp3':
            cmd.extend(["-q:a", "0"]) # Best VBR quality
        elif request.output_format.lower() == 'ogg':
            cmd.extend(["-q:a", "7"])

        cmd.append(output_path)

        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW
        )
        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise Exception(f"FFMPEG Error: {stderr.decode('utf-8', errors='ignore')}")

        return {"status": "success", "output_path": output_path}
    except Exception as e:
        print(f"Error in convert: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class OpenExternalRequest(BaseModel):
    file_path: str

class PlayExternalRequest(BaseModel):
    file_path: str



class MiniplayerStateRequest(BaseModel):
    title: str
    artist: str
    cover_url: str = ""
    isPlaying: bool
    progress: float = 0.0
    duration: float = 0.0

# Global miniplayer state
_current_miniplayer_state = {}

@app.post("/api/miniplayer/state")
def update_miniplayer_state(req: MiniplayerStateRequest):
    global _current_miniplayer_state
    _current_miniplayer_state = req.dict()
    
    # Update Discord RPC
    try:
        import discord_rpc
        discord_rpc.update_presence(
            title=req.title,
            artist=req.artist,
            is_playing=req.isPlaying,
            cover_url=req.cover_url if req.cover_url and req.cover_url.startswith("http") else None
        )
    except Exception as e:
        pass
        
    return {"status": "success"}

@app.get("/api/miniplayer/state")
def get_miniplayer_state():
    return _current_miniplayer_state


@app.post("/api/open_external")
def open_external(request: OpenExternalRequest):
    try:
        from utils import get_downloads_dir
        abs_path = os.path.join(get_downloads_dir(), request.file_path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="File not found")
        if os.name == 'nt':
            os.startfile(abs_path)
        elif sys.platform == 'darwin':
            subprocess.call(('open', abs_path))
        else:
            subprocess.call(('xdg-open', abs_path))
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/play_external")
async def play_external(request: PlayExternalRequest):
    import os
    abs_path = os.path.abspath(request.file_path)
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    # Broadcast to frontend to play immediately
    await manager.broadcast_json({"type": "PLAY_EXTERNAL", "file_path": abs_path})
    
    # Bring window to front
    try:
        import webview
        windows = webview.windows
        if windows:
            windows[0].show()
            windows[0].restore()
    except Exception:
        pass
    
    return {"status": "success"}

@app.post("/api/set_default_player")
async def set_default_player():
    import os
    import sys
    try:
        if os.name == 'nt':
            import register_windows
            register_windows.run_registration()
            return {"status": "success", "message": "Lumina registrado com sucesso no Windows!"}
        else:
            raise HTTPException(status_code=400, detail="Recurso apenas para Windows.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/library")
def get_library():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT playlist_id, video_id, title, file_path, created_at, url FROM downloads WHERE status = 'downloaded' ORDER BY created_at DESC;")
        rows = cur.fetchall()
        conn.close()
        library = []
        for r in rows:
            library.append({
                "playlist_id": r["playlist_id"],
                "video_id": r["video_id"],
                "title": r["title"],
                "file_path": r["file_path"],
                "created_at": r["created_at"],
                "url": r["url"]
            })
        return {"status": "success", "library": library}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/history")
def get_history(limit: int = 100, offset: int = 0):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT playlist_id, video_id, title, file_path, status, created_at, url
            FROM downloads
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?;
        """, (limit, offset))
        rows = cur.fetchall()
        cur.execute("SELECT COUNT(*) as total FROM downloads")
        total = cur.fetchone()["total"]
        conn.close()
        history = []
        for r in rows:
            history.append({
                "video_id": r["video_id"],
                "title": r["title"],
                "file_path": r["file_path"],
                "status": r["status"],
                "created_at": r["created_at"],
                "url": r["url"]
            })
        return {"history": history, "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/history/{video_id}")
def delete_history_item(video_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM downloads WHERE video_id = ?", (video_id,))
        conn.commit()
        conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class FixMetadataRequest(BaseModel):
    file_path: str

@app.post("/api/fix_metadata")
def fix_metadata(request: FixMetadataRequest):
    try:
        from utils import get_downloads_dir
        from shazam_fixer import fix_metadata_sync
        
        abs_path = os.path.join(get_downloads_dir(), request.file_path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
            
        result = fix_metadata_sync(abs_path)
        if result.get("success"):
            return {"status": "success", "data": result}
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Erro desconhecido"))
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

import uuid
import re

studio_jobs = {}
studio_install_jobs = {}


def is_python_installed():
    import subprocess
    try:
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        subprocess.run(["python", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW, check=True)
        return True
    except Exception:
        return False
    











class ConvertRequest(BaseModel):
    input_path: str
    output_format: str

@app.post("/api/choose_file")
def api_choose_file():
    import tkinter as tk
    from tkinter import filedialog
    import threading

    result = {"file": ""}
    
    def open_dialog():
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Selecione um arquivo de mídia",
            filetypes=[("Arquivos de Mídia", "*.mp4;*.mp3;*.wav;*.flac;*.m4a;*.ogg;*.aac;*.webm;*.mkv"), ("Todos os Arquivos", "*.*")]
        )
        result["file"] = file_path
        root.destroy()
        
    # Execute in a new thread to avoid blocking issues or main thread errors
    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()
    
    if result["file"]:
        return {"status": "ok", "file": result["file"]}
    else:
        return {"status": "cancelled", "message": "Nenhum arquivo selecionado."}

@app.post("/api/choose_lrc_file")
def api_choose_lrc_file():
    import tkinter as tk
    from tkinter import filedialog
    import threading

    result = {"file": "", "content": ""}
    
    def open_dialog():
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            title="Selecione o arquivo de letra (.lrc / .txt)",
            filetypes=[("Arquivos de Letra", "*.lrc;*.txt;*.srt"), ("Todos os Arquivos", "*.*")]
        )
        if file_path:
            result["file"] = file_path
            try:
                import codecs
                with codecs.open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    result["content"] = f.read()
            except Exception:
                pass
        root.destroy()
        
    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()
    
    return result

@app.post("/api/convert")
def api_convert(req: ConvertRequest):
    import subprocess
    import time
    from utils import get_downloads_dir
    
    if not os.path.exists(req.input_path):
        raise HTTPException(status_code=400, detail="Arquivo de entrada não encontrado.")
        
    valid_formats = ['mp3', 'wav', 'flac', 'm4a', 'ogg']
    if req.output_format.lower() not in valid_formats:
        raise HTTPException(status_code=400, detail="Formato de saída inválido.")
        
    filename = os.path.basename(req.input_path)
    name_only = os.path.splitext(filename)[0]
    
    downloads_dir = get_downloads_dir()
    converted_dir = os.path.join(downloads_dir, "converted")
    os.makedirs(converted_dir, exist_ok=True)
    
    output_path = os.path.join(converted_dir, f"{name_only}_converted.{req.output_format.lower()}")
    
    # Se o arquivo já existir, adiciona timestamp
    if os.path.exists(output_path):
        output_path = os.path.join(converted_dir, f"{name_only}_converted_{int(time.time())}.{req.output_format.lower()}")
    # Build ffmpeg command
    cmd = [
        'ffmpeg',
        '-y', # overwrite
        '-i', req.input_path
    ]
    
    # Format specific options
    if req.output_format.lower() == 'mp3':
        cmd.extend(['-codec:a', 'libmp3lame', '-q:a', '2'])
    elif req.output_format.lower() == 'm4a':
        cmd.extend(['-codec:a', 'aac', '-b:a', '192k'])
    elif req.output_format.lower() == 'ogg':
        cmd.extend(['-codec:a', 'libvorbis', '-q:a', '4'])
        
    cmd.append(output_path)
    
    CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
    
    try:
        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            text=True
        )
        
        if process.returncode != 0:
            print(f"FFmpeg error: {process.stderr}")
            raise HTTPException(status_code=500, detail="Erro na conversão do arquivo pelo FFmpeg.")
            
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="FFmpeg não encontrado no sistema.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    return {
        "status": "success",
        "output_path": output_path
    }

@app.post("/api/upload_wallpaper")
async def upload_wallpaper(file: UploadFile = File(...)):
    from utils import get_data_dir
    import shutil
    
    data_dir = get_data_dir()
    os.makedirs(data_dir, exist_ok=True)
    
    ext = os.path.splitext(file.filename)[1].lower()
    save_name = f"custom_wallpaper{ext}"
    save_path = os.path.join(data_dir, save_name)
    
    with open(save_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {"status": "success", "url": f"/data/{save_name}?v={int(time.time())}"}

@app.get("/api/artist_info")
def get_artist_info(artist: str):
    import requests
    try:
        url = f"https://api.deezer.com/search/artist?q={requests.utils.quote(artist)}"
        response = requests.get(url, timeout=5).json()
        if 'data' in response and len(response['data']) > 0:
            artist_data = response['data'][0]
            return {
                "status": "success",
                "name": artist_data.get('name'),
                "picture": artist_data.get('picture_xl') or artist_data.get('picture_large'),
                "link": artist_data.get('link')
            }
        return {"status": "not_found"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.post("/api/system/startup")
def toggle_startup(enable: bool):
    import os
    import sys
    try:
        startup_dir = os.path.join(os.getenv("APPDATA"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
        shortcut_path = os.path.join(startup_dir, "Lumina.lnk")
        
        if not enable:
            if os.path.exists(shortcut_path):
                os.remove(shortcut_path)
            return {"status": "success", "message": "Removido da inicialização"}
            
        target = os.path.abspath(sys.argv[0])
        
        # Verifica no banco de dados se deve iniciar minimizado
        start_minimized = False
        try:
            import sqlite3
            from utils import get_data_dir
            db_path = os.path.join(get_data_dir(), "downloads.db")
            if os.path.exists(db_path):
                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                cur.execute("SELECT value FROM app_settings WHERE key = 'start_minimized'")
                row = cur.fetchone()
                conn.close()
                if row and row[0] == "true":
                    start_minimized = True
        except:
            pass

        # Executable logic (se for .py ou .exe)
        if target.endswith('.py'):
            python_exe = sys.executable
            args = f'"{target}"' + (" --minimized" if start_minimized else "")
            target_path = python_exe
        else:
            target_path = target
            args = "--minimized" if start_minimized else ""
            
        vbs_content = f"""
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "{shortcut_path}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{target_path}"
oLink.Arguments = "{args}"
oLink.WorkingDirectory = "{os.path.dirname(target)}"
oLink.IconLocation = "{target_path}, 0"
oLink.Save
"""
        vbs_path = os.path.join(os.getenv("TEMP"), "create_shortcut.vbs")
        with open(vbs_path, "w", encoding="utf-8") as f:
            f.write(vbs_content)
            
        import subprocess
        subprocess.run(["cscript", "//nologo", vbs_path], creationflags=0x08000000)
        os.remove(vbs_path)
        
        return {"status": "success", "message": "Adicionado à inicialização"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/track_metadata")
def get_track_metadata(file_path: str):
    import base64
    from utils import get_downloads_dir
    abs_path = os.path.join(get_downloads_dir(), file_path)
    
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    ext = os.path.splitext(abs_path)[1].lower()
    lyrics = ""
    cover_b64 = ""
    mime_type = "image/jpeg"
    artist = ""
    album = ""
    title = ""
    year = ""
    genre = ""
    file_size = 0
    try:
        file_size = os.path.getsize(abs_path)
    except:
        pass
    
    try:
        if ext == '.mp3':
            from mutagen.mp3 import MP3
            from mutagen.id3 import ID3
            audio = MP3(abs_path)
            try:
                tags = ID3(abs_path)
                if 'TPE1' in tags: artist = tags['TPE1'].text[0]
                if 'TALB' in tags: album = tags['TALB'].text[0]
                if 'TIT2' in tags: title = tags['TIT2'].text[0]
                if 'TDRC' in tags: year = str(tags['TDRC'].text[0])
                elif 'TYER' in tags: year = str(tags['TYER'].text[0])
                if 'TCON' in tags: genre = tags['TCON'].text[0]
            except: pass
            
            if audio.tags:
                for key in audio.tags.keys():
                    if key.startswith('USLT'):
                        lyrics = audio.tags[key].text
                    if key.startswith('APIC'):
                        cover_b64 = base64.b64encode(audio.tags[key].data).decode('utf-8')
                        mime_type = audio.tags[key].mime
        elif ext == '.flac':
            from mutagen.flac import FLAC
            audio = FLAC(abs_path)
            if 'artist' in audio: artist = audio['artist'][0]
            if 'album' in audio: album = audio['album'][0]
            if 'title' in audio: title = audio['title'][0]
            if 'date' in audio: year = audio['date'][0]
            if 'genre' in audio: genre = audio['genre'][0]
            
            if 'LYRICS' in audio:
                lyrics = audio['LYRICS'][0]
            if audio.pictures:
                cover_b64 = base64.b64encode(audio.pictures[0].data).decode('utf-8')
                mime_type = audio.pictures[0].mime
        elif ext in ('.m4a', '.aac', '.mp4'):
            from mutagen.mp4 import MP4
            audio = MP4(abs_path)
            if '\xa9ART' in audio: artist = audio['\xa9ART'][0]
            if '\xa9alb' in audio: album = audio['\xa9alb'][0]
            if '\xa9nam' in audio: title = audio['\xa9nam'][0]
            if '\xa9day' in audio: year = str(audio['\xa9day'][0])
            if '\xa9gen' in audio: genre = audio['\xa9gen'][0]
            
            if '\xa9lyr' in audio:
                lyrics = audio['\xa9lyr'][0]
            if 'covr' in audio and len(audio['covr']) > 0:
                pic = audio['covr'][0]
                cover_b64 = base64.b64encode(pic).decode('utf-8')
                mime_type = "image/png" if getattr(pic, 'imageformat', None) == 2 else "image/jpeg"
    except Exception as e:
        print(f"Error reading metadata from {file_path}: {e}")
        
    return {
        "lyrics": lyrics, 
        "cover_b64": cover_b64, 
        "mime_type": mime_type,
        "artist": artist,
        "album": album,
        "title": title,
        "year": year,
        "genre": genre,
        "file_size": file_size
    }

import socket


# Mobile Sync Security
mobile_tokens = {} # token -> {"expires_at": float, "approved": bool, "device_name": str}

@app.post("/api/mobile/token/create")
def api_mobile_token_create():
    import uuid, time
    token = str(uuid.uuid4())
    mobile_tokens[token] = {"expires_at": time.time() + 300, "approved": False, "device_name": None}
    return {"token": token}

@app.get("/api/mobile/token/status")
def api_mobile_token_status(token: str):
    import time
    if token not in mobile_tokens:
        raise HTTPException(status_code=404, detail="Token not found")
    tdata = mobile_tokens[token]
    if time.time() > tdata["expires_at"]:
        del mobile_tokens[token]
        raise HTTPException(status_code=400, detail="Token expired")
    return {"approved": tdata["approved"], "device_name": tdata["device_name"]}

@app.post("/api/mobile/token/approve")
def api_mobile_token_approve(token: str):
    if token not in mobile_tokens:
        raise HTTPException(status_code=404, detail="Token not found")
    mobile_tokens[token]["approved"] = True
    return {"status": "ok"}

def verify_mobile_token(token: str):
    import time
    if not token or token not in mobile_tokens:
        raise HTTPException(status_code=403, detail="Acesso negado: Token invalido ou ausente")
    tdata = mobile_tokens[token]
    if time.time() > tdata["expires_at"]:
        del mobile_tokens[token]
        raise HTTPException(status_code=403, detail="Acesso negado: Token expirado")
    if not tdata["approved"]:
        raise HTTPException(status_code=403, detail="Acesso negado: Aguardando aprovacao no PC")

def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

@app.get("/api/network/ip")
def api_network_ip():
    return {"ip": get_local_ip()}

@app.get("/api/downloads/list")
def api_downloads_list(token: str = None):
    verify_mobile_token(token)
    try:
        d_dir = get_downloads_dir()
        files = []
        if os.path.exists(d_dir):
            for f in os.listdir(d_dir):
                if f.lower().endswith(('.mp3', '.m4a', '.flac', '.mp4')):
                    filepath = os.path.join(d_dir, f)
                    stat = os.stat(filepath)
                    files.append({
                        "name": f,
                        "size": stat.st_size,
                        "mtime": stat.st_mtime
                    })
            files.sort(key=lambda x: x['mtime'], reverse=True)
        return {"files": files}
    except Exception as e:
        return {"error": str(e)}

import uuid
import threading

zip_jobs = {}

class ZipRequest(BaseModel):
    files: List[str]

def create_zip_job(job_id, files_to_zip):
    try:
        d_dir = get_downloads_dir()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')
        
        with zipfile.ZipFile(tmp.name, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
            total = len(files_to_zip)
            for i, filename in enumerate(files_to_zip):
                filepath = os.path.join(d_dir, filename)
                if os.path.exists(filepath):
                    zf.write(filepath, filename)
                zip_jobs[job_id]["progress"] = int(((i + 1) / total) * 100)
                zip_jobs[job_id]["current_file"] = filename
                
        tmp.close()
        zip_jobs[job_id]["status"] = "done"
        zip_jobs[job_id]["filepath"] = tmp.name
    except Exception as e:
        zip_jobs[job_id]["status"] = "error"
        zip_jobs[job_id]["error"] = str(e)

@app.post("/api/downloads/zip/start")
def api_downloads_zip_start(req: ZipRequest, token: str = None):
    verify_mobile_token(token)
    if not req.files:
        raise HTTPException(status_code=400, detail="Nenhum arquivo selecionado")
    
    job_id = str(uuid.uuid4())
    zip_jobs[job_id] = {
        "status": "processing",
        "progress": 0,
        "total": len(req.files),
        "current_file": "",
        "filepath": None
    }
    
    t = threading.Thread(target=create_zip_job, args=(job_id, req.files))
    t.start()
    return {"job_id": job_id}

@app.get("/api/downloads/zip/status/{job_id}")
def api_downloads_zip_status(job_id: str, token: str = None):
    verify_mobile_token(token)
    if job_id not in zip_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return zip_jobs[job_id]


@app.get("/api/downloads/zip/download/{job_id}")
def api_downloads_zip_download(job_id: str, background_tasks: BackgroundTasks, token: str = None):
    verify_mobile_token(token)
    if job_id not in zip_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = zip_jobs[job_id]
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail="Job not finished yet")
    
    filepath = job["filepath"]
    
    def cleanup():
        try:
            os.remove(filepath)
            del zip_jobs[job_id]
        except:
            pass
            
    background_tasks.add_task(cleanup)
    
    return FileResponse(
        filepath,
        media_type='application/zip',
        filename='Lumina_Downloads.zip',
        background=None
    )

@app.get("/api/mobile", response_class=HTMLResponse)
def mobile_ui(request: Request, token: str = None):
    import time
    # Check if token is valid (even if not approved yet, we allow rendering the UI so the UI can do polling)
    if not token or token not in mobile_tokens:
        return HTMLResponse("<h1>Acesso Negado: Token inválido ou ausente. Leia o QR Code novamente.</h1>", status_code=403)
    tdata = mobile_tokens[token]
    if time.time() > tdata["expires_at"]:
        return HTMLResponse("<h1>Acesso Negado: Sessão expirada (5 minutos). Leia o QR Code novamente.</h1>", status_code=403)
        
    # Set device name from User-Agent if not set
    if not tdata["device_name"]:
        ua = request.headers.get("user-agent", "Dispositivo Desconhecido")
        # simplistic extraction
        if "iPhone" in ua: name = "iPhone"
        elif "Android" in ua: name = "Android"
        elif "Macintosh" in ua: name = "MacBook"
        elif "Windows" in ua: name = "Windows PC"
        else: name = "Celular"
        mobile_tokens[token]["device_name"] = name

    html = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Lumina Sync</title>
        <style>
        :root { --bg: #121212; --card: #1E1E1E; --primary: #FF0050; --text: #FFFFFF; --text-sec: #AAAAAA; }
            * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
            body { margin: 0; padding: 0; background-color: var(--bg); color: var(--text); padding-bottom: 80px; }
            header { background: var(--card); padding: 16px; text-align: center; border-bottom: 1px solid #333; position: sticky; top: 0; z-index: 10; }
            h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: var(--primary); }
            .subtitle { font-size: 12px; color: var(--text-sec); margin: 0; }
            .container { padding: 12px 16px; }
            
            .controls-bar { display: flex; gap: 8px; margin-bottom: 12px; justify-content: space-between; align-items: center; }
            .select-btn { background: transparent; border: 1px solid #333; color: var(--text); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; }
            
            .file-card { background: var(--card); padding: 14px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; cursor: pointer; }
            .checkbox-wrapper { width: 24px; height: 24px; flex-shrink: 0; border: 2px solid #555; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
            .file-card.selected .checkbox-wrapper { background: var(--primary); border-color: var(--primary); }
            .file-card.selected .checkbox-wrapper::after { content: "✓"; color: white; font-weight: bold; }
            
            .file-info { flex: 1; min-width: 0; }
            .file-name { font-weight: 500; font-size: 14px; margin: 0 0 3px 0; word-break: break-word; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .file-meta { font-size: 12px; color: var(--text-sec); margin: 0; }
            
            .empty { text-align: center; color: var(--text-sec); padding: 40px 20px; }
            #loading { text-align: center; padding: 40px; color: var(--text-sec); }
            
            .bottom-bar { position: fixed; bottom: 0; left: 0; right: 0; background: var(--card); border-top: 1px solid #333; padding: 16px; display: flex; transform: translateY(100%); transition: transform 0.3s; z-index: 20; }
            .bottom-bar.visible { transform: translateY(0); }
            .zip-btn { width: 100%; background: var(--primary); color: white; border: none; padding: 14px; border-radius: 10px; font-weight: 700; font-size: 16px; cursor: pointer; }
            
            .progress-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            .progress-modal.visible { opacity: 1; pointer-events: auto; }
            .progress-box { background: var(--card); padding: 24px; border-radius: 16px; width: 90%; max-width: 400px; text-align: center; }
            .progress-bar-bg { width: 100%; height: 8px; background: #333; border-radius: 4px; margin: 16px 0; overflow: hidden; }
            .progress-bar-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.3s; }
            .progress-text { font-size: 14px; color: var(--text-sec); margin-bottom: 8px; word-break: break-all; }
            .progress-title { font-weight: bold; font-size: 18px; margin: 0 0 8px 0; }
        </style>
    </head>
    <body>
        
        <div id="approval-overlay" style="position:fixed;inset:0;background:var(--bg);z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
            <h2 style="color:var(--primary);margin-bottom:10px;">Aguardando Autorização</h2>
            <p style="color:var(--text-sec);font-size:16px;">Por favor, clique em <b>Aprovar</b> no seu computador para acessar as músicas.</p>
            <div style="margin-top:30px;width:40px;height:40px;border:4px solid #333;border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
        </div>
        
        <header>

            <h1>Lumina Sync</h1>
            <p class="subtitle" id="subtitle">Carregando...</p>
        </header>
        
        <div class="container" id="controls" style="display:none;">
            <div class="controls-bar">
                <button class="select-btn" id="btn-select-all">Selecionar Tudo</button>
                <button class="select-btn" id="btn-deselect-all">Desmarcar</button>
            </div>
        </div>
        
        <div class="container" id="file-list">
            <div id="loading">Carregando musicas...</div>
        </div>
        
        <div class="bottom-bar" id="bottom-bar">
            <button class="zip-btn" id="zip-btn">Baixar 0 Músicas (.zip)</button>
        </div>
        
        <div class="progress-modal" id="progress-modal">
            <div class="progress-box">
                <h3 class="progress-title">Preparando ZIP...</h3>
                <div class="progress-bar-bg"><div class="progress-bar-fill" id="progress-fill"></div></div>
                <div class="progress-text" id="progress-text">Iniciando...</div>
                <div class="progress-text" id="progress-percent" style="font-weight:bold; color:white">0%</div>
            </div>
        </div>

        <script>
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get("token");

            let allFiles = [];
            let selectedFiles = new Set();

            
            async function pollApproval() {
                try {
                    const res = await fetch('/api/mobile/token/status?token=' + token);
                    if (res.status === 404 || res.status === 400 || res.status === 403) {
                        document.body.innerHTML = '<div style="padding:40px;text-align:center;color:white;">Sessão expirada ou negada. Feche e abra o QR Code no PC novamente.</div>';
                        return;
                    }
                    const data = await res.json();
                    if (data.approved) {
                        document.getElementById('approval-overlay').style.display = 'none';
                        loadFiles();
                    } else {
                        setTimeout(pollApproval, 1000);
                    }
                } catch(e) {
                    setTimeout(pollApproval, 1000);
                }
            }

            function formatBytes(bytes, decimals = 2) {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const dm = decimals < 0 ? 0 : decimals;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
            }

            function formatDate(ts) {
                const d = new Date(ts * 1000);
                return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
            
            function updateSelectionUI() {
                const count = selectedFiles.size;
                const bar = document.getElementById('bottom-bar');
                const btn = document.getElementById('zip-btn');
                
                if (count > 0) {
                    bar.classList.add('visible');
                    btn.innerText = `Baixar ${count} Música${count > 1 ? 's' : ''} (.zip)`;
                } else {
                    bar.classList.remove('visible');
                }
                
                document.querySelectorAll('.file-card').forEach(card => {
                    const filename = card.dataset.filename;
                    if (selectedFiles.has(filename)) {
                        card.classList.add('selected');
                    } else {
                        card.classList.remove('selected');
                    }
                });
            }

            async function loadFiles() {
                try {
                    const res = await fetch('/api/downloads/list?token=' + token);
                    const data = await res.json();
                    const container = document.getElementById('file-list');
                    container.innerHTML = '';
                    
                    if (!data.files || data.files.length === 0) {
                        document.getElementById('subtitle').innerText = 'Nenhum arquivo';
                        container.innerHTML = '<div class="empty">Nenhuma música encontrada no seu PC. Baixe algo primeiro!</div>';
                        return;
                    }
                    
                    allFiles = data.files.map(f => f.name);
                    document.getElementById('subtitle').innerText = `${allFiles.length} arquivos encontrados`;
                    document.getElementById('controls').style.display = 'block';
                    
                    data.files.forEach(f => {
                        const card = document.createElement('div');
                        card.className = 'file-card';
                        card.dataset.filename = f.name;
                        card.innerHTML = `
                            <div class="checkbox-wrapper"></div>
                            <div class="file-info">
                                <p class="file-name">${f.name}</p>
                                <p class="file-meta">${formatBytes(f.size)} • ${formatDate(f.mtime)}</p>
                            </div>
                        `;
                        card.addEventListener('click', () => {
                            if (selectedFiles.has(f.name)) {
                                selectedFiles.delete(f.name);
                            } else {
                                selectedFiles.add(f.name);
                            }
                            updateSelectionUI();
                        });
                        container.appendChild(card);
                    });
                } catch (e) {
                    document.getElementById('file-list').innerHTML = '<div class="empty" style="color: #ff4444">Erro ao carregar arquivos: ' + e.message + '</div>';
                }
            }
            
            document.getElementById('btn-select-all').addEventListener('click', () => {
                allFiles.forEach(f => selectedFiles.add(f));
                updateSelectionUI();
            });
            
            document.getElementById('btn-deselect-all').addEventListener('click', () => {
                selectedFiles.clear();
                updateSelectionUI();
            });
            
            document.getElementById('zip-btn').addEventListener('click', async () => {
                if (selectedFiles.size === 0) return;
                
                const filesArray = Array.from(selectedFiles);
                const modal = document.getElementById('progress-modal');
                modal.classList.add('visible');
                
                try {
                    const res = await fetch('/api/downloads/zip/start?token=' + token, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ files: filesArray })
                    });
                    const data = await res.json();
                    
                    if (!data.job_id) throw new Error("Falha ao iniciar trabalho");
                    
                    const jobId = data.job_id;
                    const poll = setInterval(async () => {
                        const statusRes = await fetch(`/api/downloads/zip/status/${jobId}?token=` + token);
                        const statusData = await statusRes.json();
                        
                        document.getElementById('progress-fill').style.width = statusData.progress + '%';
                        document.getElementById('progress-percent').innerText = statusData.progress + '%';
                        document.getElementById('progress-text').innerText = "Processando: " + (statusData.current_file || "...");
                        
                        if (statusData.status === 'done') {
                            clearInterval(poll);
                            document.getElementById('progress-text').innerText = "Pronto! Iniciando download...";
                            setTimeout(() => {
                                modal.classList.remove('visible');
                                window.location.href = `/api/downloads/zip/download/${jobId}?token=` + token;
                                selectedFiles.clear();
                                updateSelectionUI();
                            }, 1500);
                        } else if (statusData.status === 'error') {
                            clearInterval(poll);
                            alert("Erro: " + statusData.error);
                            modal.classList.remove('visible');
                        }
                    }, 1000);
                    
                } catch(e) {
                    alert("Erro ao iniciar download: " + e.message);
                    modal.classList.remove('visible');
                }
            });
            
            pollApproval();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

from utils import get_downloads_dir, get_data_dir
try:
    os.makedirs(get_downloads_dir(), exist_ok=True)
    app.mount("/downloads", StaticFiles(directory=get_downloads_dir()), name="downloads")
except Exception as e:
    print(f"Could not mount downloads dir: {e}")

try:
    os.makedirs(get_data_dir(), exist_ok=True)
    app.mount("/data", StaticFiles(directory=get_data_dir()), name="data")
except Exception as e:
    print(f"Could not mount data dir: {e}")

# --- VOICE ENGINE API ROUTES ---
@app.get("/api/voice/status")
def get_voice_status():
    return {"status": voice_engine.get_status()}

@app.post("/api/voice/toggle")
def toggle_voice():
    current_status = voice_engine.get_status()
    if current_status == "running" or current_status == "downloading":
        voice_engine.stop()
    else:
        voice_engine.start()
    return {"status": voice_engine.get_status()}
# -------------------------------

static_dir = get_resource_path("static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # Start FastAPI server on port 8000, disabling access logs to prevent console spam
    uvicorn.run("main:app", host="127.0.0.1", port=8000, log_level="info", access_log=False)
