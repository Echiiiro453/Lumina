from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import os
import socket
import time
import uuid
import threading
import tempfile
import zipfile

from utils import get_downloads_dir
from websocket_manager import manager

router = APIRouter()

mobile_tokens = {} # token -> {"expires_at": float, "approved": bool, "device_name": str}

@router.post("/api/mobile/token/create")
def api_mobile_token_create():
    import uuid, time
    token = str(uuid.uuid4())
    mobile_tokens[token] = {"expires_at": time.time() + 300, "approved": False, "device_name": None}
    return {"token": token}

@router.get("/api/mobile/token/status")
def api_mobile_token_status(token: str):
    import time
    if token not in mobile_tokens:
        raise HTTPException(status_code=404, detail="Token not found")
    tdata = mobile_tokens[token]
    if time.time() > tdata["expires_at"]:
        del mobile_tokens[token]
        raise HTTPException(status_code=400, detail="Token expired")
    return {"approved": tdata["approved"], "device_name": tdata["device_name"]}

@router.post("/api/mobile/token/approve")
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

@router.get("/api/network/ip")
def api_network_ip():
    return {"ip": get_local_ip()}

@router.get("/api/downloads/list")
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
        from utils import safe_resolve, SafePathError
        d_dir = get_downloads_dir()
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix='.zip')

        with zipfile.ZipFile(tmp.name, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
            total = len(files_to_zip)
            for i, filename in enumerate(files_to_zip):
                # Cada filename deve resolver dentro da biblioteca (bloqueia ../../).
                # Proteção portada de main.py (PR 5.1) — antes era os.path.join cru.
                try:
                    filepath = safe_resolve(filename, root=d_dir)
                except SafePathError:
                    zip_jobs[job_id]["progress"] = int(((i + 1) / total) * 100)
                    continue
                if os.path.exists(filepath):
                    zf.write(filepath, os.path.basename(filename))
                zip_jobs[job_id]["progress"] = int(((i + 1) / total) * 100)
                zip_jobs[job_id]["current_file"] = filename

        tmp.close()
        zip_jobs[job_id]["status"] = "done"
        zip_jobs[job_id]["filepath"] = tmp.name
    except Exception as e:
        zip_jobs[job_id]["status"] = "error"
        zip_jobs[job_id]["error"] = str(e)

@router.post("/api/downloads/zip/start")
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

@router.get("/api/downloads/zip/status/{job_id}")
def api_downloads_zip_status(job_id: str, token: str = None):
    verify_mobile_token(token)
    if job_id not in zip_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return zip_jobs[job_id]


@router.get("/api/downloads/zip/download/{job_id}")
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


class MobileDownloadRequest(BaseModel):
    url: str
    title: Optional[str] = None
    thumbnail: Optional[str] = None

@router.post("/api/mobile/download")
async def api_mobile_download(req: MobileDownloadRequest, token: str = None):
    verify_mobile_token(token)
    
    # Broadcast to connected PCs to enqueue the download
    await manager.broadcast_json({
        "type": "REMOTE_DOWNLOAD",
        "video": {
            "url": req.url,
            "title": req.title or "Música do celular",
            "thumbnail": req.thumbnail
        }
    })
    return {"status": "ok"}

@router.get("/api/mobile", response_class=HTMLResponse)
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
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Lumina Sync</title>
        <style>
            :root { --bg: #121212; --card: #1E1E1E; --primary: #FF0050; --text: #FFFFFF; --text-sec: #AAAAAA; --nav-bg: #1A1A1A; }
            * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; -webkit-tap-highlight-color: transparent; }
            body { margin: 0; padding: 0; background-color: var(--bg); color: var(--text); padding-bottom: 80px; overflow-x: hidden; }
            
            /* Overlay */
            #approval-overlay { position: fixed; inset: 0; background: var(--bg); z-index: 999; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; }
            #approval-overlay h2 { color: var(--primary); margin-bottom: 10px; }
            #approval-overlay p { color: var(--text-sec); font-size: 16px; }
            .spinner { margin-top: 30px; width: 40px; height: 40px; border: 4px solid #333; border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 100% { transform: rotate(360deg); } }

            /* Header */
            header { background: var(--card); padding: 16px; text-align: center; position: sticky; top: 0; z-index: 10; border-bottom: 1px solid #333; }
            h1 { margin: 0 0 4px 0; font-size: 20px; font-weight: 700; color: var(--text); }
            .subtitle { font-size: 12px; color: var(--primary); margin: 0; font-weight: 500; }

            /* Tabs */
            .tab-content { display: none; padding: 16px; animation: fadeIn 0.2s ease; }
            .tab-content.active { display: block; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

            /* Search Tab */
            .search-box { display: flex; gap: 8px; margin-bottom: 16px; }
            .search-input { flex: 1; background: #2A2A2A; border: none; color: white; padding: 12px 16px; border-radius: 12px; font-size: 16px; outline: none; }
            .search-input::placeholder { color: #888; }
            .search-btn { background: var(--primary); color: white; border: none; width: 44px; border-radius: 12px; font-weight: bold; cursor: pointer; display: flex; align-items: center; justify-content: center; }

            /* Track Items */
            .track-card { background: var(--card); padding: 12px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
            .track-img { width: 50px; height: 50px; border-radius: 8px; object-fit: cover; background: #333; }
            .track-info { flex: 1; min-width: 0; }
            .track-title { font-weight: 600; font-size: 14px; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .track-artist { font-size: 12px; color: var(--text-sec); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .download-btn { background: var(--primary); color: white; border: none; padding: 8px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; cursor: pointer; }
            .download-btn.done { background: #333; color: #888; }

            /* Local Files Tab */
            .controls-bar { display: flex; gap: 8px; margin-bottom: 16px; justify-content: space-between; }
            .select-btn { background: #2A2A2A; border: none; color: var(--text); padding: 8px 16px; border-radius: 20px; font-size: 12px; font-weight: 500; flex: 1; }
            
            .file-card { background: var(--card); padding: 12px; border-radius: 12px; margin-bottom: 10px; display: flex; align-items: center; gap: 12px; cursor: pointer; transition: background 0.2s; }
            .checkbox-wrapper { width: 22px; height: 22px; border: 2px solid #555; border-radius: 6px; display: flex; align-items: center; justify-content: center; }
            .file-card.selected .checkbox-wrapper { background: var(--primary); border-color: var(--primary); }
            .file-card.selected .checkbox-wrapper::after { content: "✓"; color: white; font-size: 14px; font-weight: bold; }
            
            .empty-state { text-align: center; color: var(--text-sec); padding: 40px 20px; font-size: 14px; }
            
            /* Bottom Bar (ZIP) */
            .bottom-bar { position: fixed; bottom: 65px; left: 0; right: 0; padding: 12px 16px; pointer-events: none; opacity: 0; transition: all 0.3s; transform: translateY(10px); }
            .bottom-bar.visible { opacity: 1; pointer-events: auto; transform: translateY(0); }
            .zip-btn { width: 100%; background: var(--primary); color: white; border: none; padding: 16px; border-radius: 14px; font-weight: 700; font-size: 15px; box-shadow: 0 4px 15px rgba(255,0,80,0.3); }

            /* Navigation */
            nav { position: fixed; bottom: 0; left: 0; right: 0; background: var(--nav-bg); display: flex; border-top: 1px solid #333; padding-bottom: env(safe-area-inset-bottom); z-index: 50; }
            .nav-item { flex: 1; padding: 12px 0; text-align: center; color: var(--text-sec); font-size: 11px; font-weight: 500; display: flex; flex-direction: column; align-items: center; gap: 4px; }
            .nav-item.active { color: var(--primary); }
            .nav-icon { width: 24px; height: 24px; fill: currentColor; }

            /* Progress Modal */
            .progress-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 100; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; }
            .progress-modal.visible { opacity: 1; pointer-events: auto; }
            .progress-box { background: var(--card); padding: 24px; border-radius: 16px; width: 90%; max-width: 400px; text-align: center; }
            .progress-bar-bg { width: 100%; height: 6px; background: #333; border-radius: 3px; margin: 16px 0; overflow: hidden; }
            .progress-bar-fill { height: 100%; background: var(--primary); width: 0%; transition: width 0.3s; }
            .progress-text { font-size: 13px; color: var(--text-sec); margin-bottom: 8px; }
            .progress-title { font-weight: bold; font-size: 16px; margin: 0 0 8px 0; }
        </style>
    </head>
    <body>
        
        <div id="approval-overlay">
            <h2>Aguardando Autorização</h2>
            <p>Por favor, clique em <b>Aprovar</b> no Lumina no computador.</p>
            <div class="spinner"></div>
        </div>
        
        <header>
            <h1>Lumina</h1>
            <p class="subtitle" id="connection-status">Conectando...</p>
        </header>

        <!-- SEARCH TAB -->
        <div id="tab-search" class="tab-content active">
            <div class="search-box">
                <input type="text" id="search-input" class="search-input" placeholder="Música, Artista ou Link..." autocomplete="off">
                <button class="search-btn" id="btn-search">
                    <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
            </div>
            <div id="search-results">
                <div class="empty-state" style="padding-top:20px;">
                    Busque músicas para enviar direto para o PC.
                </div>
            </div>
        </div>

        <!-- FILES TAB -->
        <div id="tab-files" class="tab-content">
            <div class="controls-bar" id="files-controls" style="display:none;">
                <button class="select-btn" id="btn-select-all">Selecionar Tudo</button>
                <button class="select-btn" id="btn-deselect-all">Desmarcar</button>
            </div>
            <div id="file-list">
                <div class="empty-state">Carregando músicas...</div>
            </div>
        </div>
        
        <div class="bottom-bar" id="bottom-bar">
            <button class="zip-btn" id="zip-btn">Baixar 0 Músicas (.zip)</button>
        </div>

        <nav>
            <div class="nav-item active" onclick="switchTab('search')">
                <svg class="nav-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                Buscar
            </div>
            <div class="nav-item" onclick="switchTab('files')">
                <svg class="nav-icon" viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                Arquivos (PC)
            </div>
        </nav>
        
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

            // --- TABS ---
            function switchTab(tab) {
                document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
                document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
                
                document.getElementById('tab-' + tab).classList.add('active');
                if (tab === 'search') {
                    document.querySelectorAll('.nav-item')[0].classList.add('active');
                    document.getElementById('bottom-bar').style.display = 'none';
                } else {
                    document.querySelectorAll('.nav-item')[1].classList.add('active');
                    document.getElementById('bottom-bar').style.display = 'block';
                    loadFiles(); // reload
                }
            }

            // --- AUTH ---
            async function pollApproval() {
                try {
                    const res = await fetch('/api/mobile/token/status?token=' + token);
                    if (res.status === 404 || res.status === 400 || res.status === 403) {
                        document.body.innerHTML = '<div class="empty-state">Sessão expirada. Leia o QR Code novamente.</div>';
                        return;
                    }
                    const data = await res.json();
                    if (data.approved) {
                        document.getElementById('approval-overlay').style.display = 'none';
                        document.getElementById('connection-status').innerText = 'Conectado';
                        document.getElementById('connection-status').style.color = '#4CAF50';
                    } else {
                        setTimeout(pollApproval, 1000);
                    }
                } catch(e) {
                    setTimeout(pollApproval, 1000);
                }
            }

            // --- SEARCH ---
            const searchInput = document.getElementById('search-input');
            const searchBtn = document.getElementById('btn-search');
            const searchResults = document.getElementById('search-results');

            async function performSearch() {
                const q = searchInput.value.trim();
                if (!q) return;
                
                searchResults.innerHTML = '<div class="empty-state"><div class="spinner" style="margin:0 auto;"></div><br>Buscando...</div>';
                try {
                    const res = await fetch('/search', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({query: q, limit: 10})
                    });
                    const data = await res.json();
                    
                    searchResults.innerHTML = '';
                    
                    if (data && data.results && data.results.length > 0) {
                        data.results.forEach(track => {
                            const card = document.createElement('div');
                            card.className = 'track-card';
                            card.innerHTML = `
                                <img src="${track.thumbnail || ''}" class="track-img" onerror="this.style.display='none'">
                                <div class="track-info">
                                    <p class="track-title">${track.title}</p>
                                    <p class="track-artist">${track.uploader || ''}</p>
                                </div>
                                <button class="download-btn">Baixar</button>
                            `;
                            
                            const btn = card.querySelector('.download-btn');
                            btn.onclick = async () => {
                                btn.innerText = 'Enviado';
                                btn.classList.add('done');
                                await fetch('/api/mobile/download?token=' + token, {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/json'},
                                    body: JSON.stringify({
                                        url: track.url,
                                        title: track.title,
                                        thumbnail: track.thumbnail
                                    })
                                });
                            };
                            
                            searchResults.appendChild(card);
                        });
                    } else {
                        searchResults.innerHTML = '<div class="empty-state">Nenhum resultado.</div>';
                    }
                } catch(e) {
                    searchResults.innerHTML = '<div class="empty-state">Erro na busca.</div>';
                }
            }

            searchBtn.onclick = performSearch;
            searchInput.onkeypress = (e) => { if(e.key === 'Enter') performSearch(); };

            // --- LOCAL FILES ---
            let allFiles = [];
            let selectedFiles = new Set();

            function formatBytes(bytes) {
                if (bytes === 0) return '0 B';
                const k = 1024;
                const sizes = ['B', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
            }

            function updateSelectionUI() {
                const count = selectedFiles.size;
                const bar = document.getElementById('bottom-bar');
                const btn = document.getElementById('zip-btn');
                
                if (count > 0 && document.getElementById('tab-files').classList.contains('active')) {
                    bar.classList.add('visible');
                    btn.innerText = `Baixar ${count} Música${count > 1 ? 's' : ''} (.zip)`;
                } else {
                    bar.classList.remove('visible');
                }
                
                document.querySelectorAll('.file-card').forEach(card => {
                    if (selectedFiles.has(card.dataset.filename)) card.classList.add('selected');
                    else card.classList.remove('selected');
                });
            }

            async function loadFiles() {
                try {
                    const res = await fetch('/api/downloads/list?token=' + token);
                    const data = await res.json();
                    const container = document.getElementById('file-list');
                    container.innerHTML = '';
                    
                    if (!data.files || data.files.length === 0) {
                        container.innerHTML = '<div class="empty-state">Nenhuma música baixada no PC. Busque e baixe algo!</div>';
                        document.getElementById('files-controls').style.display = 'none';
                        return;
                    }
                    
                    allFiles = data.files.map(f => f.name);
                    document.getElementById('files-controls').style.display = 'flex';
                    
                    data.files.forEach(f => {
                        const card = document.createElement('div');
                        card.className = 'file-card';
                        card.dataset.filename = f.name;
                        card.innerHTML = `
                            <div class="checkbox-wrapper"></div>
                            <div class="track-info">
                                <p class="track-title">${f.name}</p>
                                <p class="track-artist">${formatBytes(f.size)}</p>
                            </div>
                        `;
                        card.addEventListener('click', () => {
                            if (selectedFiles.has(f.name)) selectedFiles.delete(f.name);
                            else selectedFiles.add(f.name);
                            updateSelectionUI();
                        });
                        if (selectedFiles.has(f.name)) card.classList.add('selected');
                        container.appendChild(card);
                    });
                } catch (e) {
                    document.getElementById('file-list').innerHTML = '<div class="empty-state" style="color:#ff4444">Erro ao carregar.</div>';
                }
            }

            document.getElementById('btn-select-all').onclick = () => { allFiles.forEach(f => selectedFiles.add(f)); updateSelectionUI(); };
            document.getElementById('btn-deselect-all').onclick = () => { selectedFiles.clear(); updateSelectionUI(); };

            document.getElementById('zip-btn').onclick = async () => {
                if (selectedFiles.size === 0) return;
                const modal = document.getElementById('progress-modal');
                modal.classList.add('visible');
                try {
                    const res = await fetch('/api/downloads/zip/start?token=' + token, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ files: Array.from(selectedFiles) })
                    });
                    const data = await res.json();
                    if (!data.job_id) throw new Error("Falha");
                    
                    const jobId = data.job_id;
                    const poll = setInterval(async () => {
                        const statusRes = await fetch(`/api/downloads/zip/status/${jobId}?token=` + token);
                        const s = await statusRes.json();
                        
                        document.getElementById('progress-fill').style.width = s.progress + '%';
                        document.getElementById('progress-percent').innerText = s.progress + '%';
                        document.getElementById('progress-text').innerText = s.current_file || "...";
                        
                        if (s.status === 'done') {
                            clearInterval(poll);
                            document.getElementById('progress-text').innerText = "Iniciando download...";
                            setTimeout(() => {
                                modal.classList.remove('visible');
                                window.location.href = `/api/downloads/zip/download/${jobId}?token=` + token;
                                selectedFiles.clear();
                                updateSelectionUI();
                            }, 1000);
                        } else if (s.status === 'error') {
                            clearInterval(poll);
                            alert("Erro: " + s.error);
                            modal.classList.remove('visible');
                        }
                    }, 1000);
                } catch(e) {
                    alert("Erro ao zipar");
                    modal.classList.remove('visible');
                }
            };
            
            pollApproval();
        </script>
    </body>
    </html>
    """
    return HTMLResponse(content=html)

# NOTE: os app.mount('/downloads', ...) e app.mount('/data', ...) que existiam aqui foram
# removidos — eles referenciavam 'app', que não é importado neste módulo de router, gerando
# sempre "Could not mount downloads dir: name 'app' is not defined". Esses mounts já existem
# em main.py (linha ~2042/2048) e são a fonte correta. PR 6.3c.

# --- VOICE ENGINE API ROUTES ---

