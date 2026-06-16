with open('backend/main.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "mobile_tokens = {}" in line:
        start_idx = i
    if '@app.get("/api/voice/status")' in line:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    extracted_block = "".join(lines[start_idx:end_idx])
    router_block = extracted_block.replace('@app.', '@router.')
    
    mobile_content = f"""from fastapi import APIRouter, HTTPException, Request, BackgroundTasks
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

{router_block}
"""
    with open('backend/routers/mobile.py', 'w', encoding='utf-8') as f:
        f.write(mobile_content)
        
    print("Extracting mobile router successful!")
    
    # Also patch main.py
    with open('backend/main.py', 'r', encoding='utf-8') as f:
        text = f.read()

    if "from routers.mobile import router as mobile_router" not in text:
        text = text.replace(
            'app.include_router(settings_router)',
            'app.include_router(settings_router)\\nfrom routers.mobile import router as mobile_router\\napp.include_router(mobile_router)'
        )
        with open('backend/main.py', 'w', encoding='utf-8') as f:
            f.write(text)
        print("Patching main.py with mobile_router successful!")
else:
    print(f"Markers not found! start: {start_idx}, end: {end_idx}")
