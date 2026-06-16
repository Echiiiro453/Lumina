import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    text = f.read()

# We look for mobile_tokens = {} and the end of the mobile UI which is the end of the HTML block
start_marker = 'mobile_tokens = {} # token -> {"expires_at": float, "approved": bool, "device_name": str}'

# The HTML block ends with:
#     return HTMLResponse(html, status_code=200)
end_marker = 'return HTMLResponse(html, status_code=200)'

if start_marker in text and end_marker in text:
    start_idx = text.find(start_marker)
    end_idx = text.find(end_marker) + len(end_marker)
    
    extracted_block = text[start_idx:end_idx]
    
    # Replace @app with @router
    router_block = extracted_block.replace('@app.', '@router.')
    
    # Create the routers/mobile.py file
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
else:
    print("Markers not found!")
