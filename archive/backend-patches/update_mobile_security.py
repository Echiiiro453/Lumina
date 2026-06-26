import os
import re

file_path = r"e:\youtubr\youtubeMusicDownload-main\backend\main.py"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add mobile_tokens globally
token_logic = """
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
"""

# Insert before get_local_ip
content = content.replace("def get_local_ip():", token_logic + "\ndef get_local_ip():")

# 2. Patch endpoints to use token
# api_downloads_list
content = content.replace('def api_downloads_list():', 'def api_downloads_list(token: str = None):\n    verify_mobile_token(token)')

# api_downloads_zip_start
content = content.replace('def api_downloads_zip_start(req: ZipRequest):', 'def api_downloads_zip_start(req: ZipRequest, token: str = None):\n    verify_mobile_token(token)')

# api_downloads_zip_status
content = content.replace('def api_downloads_zip_status(job_id: str):', 'def api_downloads_zip_status(job_id: str, token: str = None):\n    verify_mobile_token(token)')

# api_downloads_zip_download
content = content.replace('def api_downloads_zip_download(job_id: str, background_tasks: BackgroundTasks):', 'def api_downloads_zip_download(job_id: str, background_tasks: BackgroundTasks, token: str = None):\n    verify_mobile_token(token)')

# 3. Patch mobile UI endpoint
mobile_ui_start = """@app.get("/api/mobile", response_class=HTMLResponse)
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
"""

content = content.replace('@app.get("/api/mobile", response_class=HTMLResponse)\ndef mobile_ui():', mobile_ui_start)

# Add token var to JS in HTML
content = content.replace('<script>\n            let allFiles = [];', f'<script>\n            const urlParams = new URLSearchParams(window.location.search);\n            const token = urlParams.get("token");\n\n            let allFiles = [];')

# Replace API calls in HTML to include token
content = content.replace("fetch('/api/downloads/list')", "fetch('/api/downloads/list?token=' + token)")
content = content.replace("fetch('/api/downloads/zip/start'", "fetch('/api/downloads/zip/start?token=' + token")
content = content.replace("fetch(`/api/downloads/zip/status/${jobId}`)", "fetch(`/api/downloads/zip/status/${jobId}?token=` + token)")
content = content.replace("window.location.href = `/api/downloads/zip/download/${jobId}`", "window.location.href = `/api/downloads/zip/download/${jobId}?token=` + token")

# Add JS Polling for approval state
polling_js = """
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
"""

content = content.replace('function formatBytes(bytes, decimals = 2) {', polling_js + '\n            function formatBytes(bytes, decimals = 2) {')

# Start polling instead of loadFiles
content = content.replace('loadFiles();\n        </script>', 'pollApproval();\n        </script>')

# Add approval overlay to HTML
overlay_html = """
        <div id="approval-overlay" style="position:fixed;inset:0;background:var(--bg);z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px;">
            <h2 style="color:var(--primary);margin-bottom:10px;">Aguardando Autorização</h2>
            <p style="color:var(--text-sec);font-size:16px;">Por favor, clique em <b>Aprovar</b> no seu computador para acessar as músicas.</p>
            <div style="margin-top:30px;width:40px;height:40px;border:4px solid #333;border-top-color:var(--primary);border-radius:50%;animation:spin 1s linear infinite;"></div>
            <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
        </div>
        
        <header>
"""

content = content.replace('<header>', overlay_html, 1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated main.py successfully")
