import os
import urllib.request
import zipfile
import asyncio
from utils import get_data_dir

DENO_URL = "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip"

def get_deno_path():
    data_dir = get_data_dir()
    deno_exe = os.path.join(data_dir, "deno", "deno.exe")
    if os.path.exists(deno_exe):
        return deno_exe
    return None

def download_and_extract_deno():
    data_dir = get_data_dir()
    deno_dir = os.path.join(data_dir, "deno")
    deno_zip = os.path.join(data_dir, "deno.zip")
    deno_exe = os.path.join(deno_dir, "deno.exe")
    
    if os.path.exists(deno_exe):
        return deno_exe
        
    print("[\033[94mDenoManager\033[0m] Iniciando download do Deno (Interpretador JS)...")
    try:
        urllib.request.urlretrieve(DENO_URL, deno_zip)
        
        os.makedirs(deno_dir, exist_ok=True)
        with zipfile.ZipFile(deno_zip, 'r') as zip_ref:
            zip_ref.extractall(deno_dir)
            
        if os.path.exists(deno_zip):
            os.remove(deno_zip)
            
        print("[\033[32mDenoManager\033[0m] Deno instalado com sucesso!")
        return deno_exe
    except Exception as e:
        print(f"[\033[31mDenoManager\033[0m] Erro ao instalar Deno: {e}")
        return None

async def ensure_deno_installed():
    """Roda o download em uma thread separada para não bloquear o event loop do FastAPI"""
    if not get_deno_path():
        await asyncio.to_thread(download_and_extract_deno)
