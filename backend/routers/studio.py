from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os
import sys
import uuid
import re
import asyncio
import subprocess
import urllib.request
from utils import get_downloads_dir, get_studio_dir, get_data_dir

router = APIRouter()

studio_jobs = {}
studio_install_jobs = {}

class StudioSplitRequest(BaseModel):
    file_path: str
    quality: str = "fast"
    model: str = "htdemucs_ft"
    two_stems: bool = True

def is_python_installed():
    import subprocess
    try:
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        subprocess.run(["python", "--version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=CREATE_NO_WINDOW, check=True)
        return True
    except Exception:
        return False
    
async def run_demucs_job(job_id: str, file_path: str, quality: str, model: str, two_stems: bool):
    try:
        from utils import get_downloads_dir, get_studio_dir
        import subprocess
        
        abs_path = os.path.join(get_downloads_dir(), file_path)
        if not os.path.exists(abs_path):
            studio_jobs[job_id].update({"status": "error", "message": "Arquivo original não encontrado.", "progress": 0})
            return
            
        studio_dir = get_studio_dir()
        CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
        
        overlap = '0.25'
        shifts = '0'
        if quality == 'balanced':
            overlap = '0.50'
        elif quality == 'studio':
            overlap = '0.75'
            shifts = '2' # Aumentado de 1 para 2
        elif quality == 'ultra':
            overlap = '0.99'
            shifts = '4' # Aumentado de 2 para 4 para maior redução de ruído

        if getattr(sys, 'frozen', False):
            # PyInstaller mode: Lumina.exe --run-demucs ...
            cmd_args = [sys.executable, '--run-demucs']
        else:
            # Source mode: python main.py --run-demucs ...
            main_script = os.path.abspath(sys.argv[0])
            cmd_args = [sys.executable, main_script, '--run-demucs']

        cmd_args.extend([
            abs_path, '-n', model, 
            '--overlap', overlap, 
            '-o', studio_dir, '--mp3', '--mp3-bitrate', '320'
        ])
        
        if two_stems:
            cmd_args.extend(['--two-stems', 'vocals'])

        if shifts != '0':
            cmd_args.extend(['--shifts', shifts])

        print(f"[\033[94mIA Studio\033[0m] Executando comando IA: {' '.join(cmd_args)}")

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                creationflags=CREATE_NO_WINDOW
            )
        except FileNotFoundError:
            python_installed = is_python_installed()
            print("[\033[31mIA Studio\033[0m] ERRO: Demucs não encontrado no sistema.")
            studio_jobs[job_id].update({
                "status": "error", 
                "message": "Motor de IA (Demucs) não encontrado neste PC.", 
                "progress": 0,
                "demucs_missing": True,
                "python_missing": not python_installed
            })
            return
            
        print(f"[\033[94mIA Studio\033[0m] Iniciando separação para: {os.path.basename(abs_path)}")
        
        last_log_progress = -1
        buffer = ""
        while True:
            chunk = await process.stderr.read(1024)
            if not chunk:
                break
            text = chunk.decode(errors='replace')
            buffer += text
            
            # Keep buffer size in check
            if len(buffer) > 2048:
                buffer = buffer[-2048:]
            
            # Extract progress
            match_pct = re.findall(r'(\d+)%\|', buffer)
            if match_pct:
                progress = int(match_pct[-1])
                studio_jobs[job_id]["progress"] = progress
                studio_jobs[job_id]["status"] = "processing"
                
                # Check for elapsed time, ETA and speed in the buffer
                last_idx = buffer.rfind(f"{progress}%|")
                if last_idx != -1:
                    sub = buffer[last_idx:]
                    match_time = re.search(r'\[(\d+:\d+(?::\d+)?)\s*<\s*(\d+:\d+(?::\d+)?)\s*,\s*([^\]]+)\]', sub)
                    if match_time:
                        elapsed = match_time.group(1)
                        eta = match_time.group(2)
                        speed = match_time.group(3).strip()
                        
                        studio_jobs[job_id]["elapsed"] = elapsed
                        studio_jobs[job_id]["eta"] = eta
                        studio_jobs[job_id]["speed"] = speed
                        studio_jobs[job_id]["message"] = f"Separando faixas: {progress}% (Restante: {eta} @ {speed})"
                    else:
                        studio_jobs[job_id]["message"] = f"Separando faixas: {progress}%"
                else:
                    studio_jobs[job_id]["message"] = f"Separando faixas: {progress}%"
                
                if progress % 10 == 0 and progress != last_log_progress:
                    print(f"[\033[94mIA Studio\033[0m] Extraindo canais: {progress}%")
                    last_log_progress = progress
                
        await process.wait()
        
        if process.returncode != 0:
            print(f"[\033[31mIA Studio\033[0m] ERRO na separação: Código {process.returncode}")
            studio_jobs[job_id].update({"status": "error", "message": "Falha na separação da música.", "progress": 0})
        else:
            print(f"[\033[32mIA Studio\033[0m] SUCESSO! Separação concluída e salva na pasta Studio.")
            studio_jobs[job_id].update({"status": "success", "message": "Música separada por IA com sucesso!", "output_dir": studio_dir, "progress": 100})
            
    except Exception as e:
        print(f"[\033[31mIA Studio\033[0m] EXCEPTION: {e}")
        studio_jobs[job_id].update({"status": "error", "message": str(e), "progress": 0})

@router.post("/api/studio/split")
async def studio_split(request: StudioSplitRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    studio_jobs[job_id] = {
        "status": "starting",
        "progress": 0,
        "message": "Inicializando IA...",
        "file_path": request.file_path,
        "quality": request.quality,
        "model": request.model,
        "two_stems": request.two_stems,
        "eta": "",
        "speed": "",
        "elapsed": ""
    }
    background_tasks.add_task(run_demucs_job, job_id, request.file_path, request.quality, request.model, request.two_stems)
    return {"job_id": job_id}

@router.get("/api/studio/jobs")
def get_studio_all_jobs():
    return studio_jobs

@router.get("/api/studio/status/{job_id}")
def get_studio_status(job_id: str):
    if job_id not in studio_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return studio_jobs[job_id]

def install_ai_worker_REMOVED(job_id: str):
    # REMOVIDO em PR 6.2: esta função era usada apenas pela 1ª definição de
    # /api/studio/install, que era sombreada pela 2ª (a vencedora). Mantida como stub
    # vazio só para evitar quebrar imports eventuais; a lógica real está em run_install_demucs.
    pass

async def run_install_full(job_id: str):
    import subprocess
    import asyncio
    import urllib.request
    from utils import get_downloads_dir
    
    CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
    studio_install_jobs[job_id] = {"status": "processing", "message": "Baixando instalador do Python 3.10..."}
    
    installer_path = os.path.join(get_downloads_dir(), "python_installer.exe")
    url = "https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe"
    try:
        urllib.request.urlretrieve(url, installer_path)
    except Exception as e:
        studio_install_jobs[job_id] = {"status": "error", "message": f"Erro ao baixar Python: {e}"}
        return

    studio_install_jobs[job_id]["message"] = "Instalando Python silenciosamente na pasta local...\nIsso não requer permissão de administrador."
    cmd_install = [installer_path, '/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_test=0']
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd_install, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, creationflags=CREATE_NO_WINDOW
        )
        await proc.wait()
        if proc.returncode != 0:
            studio_install_jobs[job_id] = {"status": "error", "message": f"Falha ao instalar o Python. Código: {proc.returncode}"}
            return
    except Exception as e:
        studio_install_jobs[job_id] = {"status": "error", "message": f"Erro fatal ao instalar Python: {e}"}
        return

    studio_install_jobs[job_id]["message"] = "Python instalado com sucesso!\n\nIniciando download do Motor de IA (Demucs) (~2GB)..."
    
    # Python is installed in %LocalAppData%\Programs\Python\Python310\python.exe
    python_exe = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Programs', 'Python', 'Python310', 'python.exe')
    if not os.path.exists(python_exe):
        # Fallback to general 'python' just in case
        python_exe = "python"
        
    cmd_pip = [python_exe, '-m', 'pip', 'install', 'demucs']
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd_pip,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW,
        )
    except FileNotFoundError:
        studio_install_jobs[job_id] = {"status": "error", "message": "Executável do Python não encontrado após instalação!"}
        return
        
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        text = line.decode(errors='replace').strip()
        if text:
            studio_install_jobs[job_id]["message"] = text
    
    await process.wait()
    if process.returncode == 0:
        studio_install_jobs[job_id]["status"] = "success"
        studio_install_jobs[job_id]["message"] = "Inteligência Artificial instalada com sucesso!"
    else:
        studio_install_jobs[job_id]["status"] = "error"
        studio_install_jobs[job_id]["message"] = f"Erro na instalação da IA (código {process.returncode})."

@router.post("/api/studio/install_full")
async def studio_install_full(background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    studio_install_jobs[job_id] = {"status": "processing", "message": "Iniciando processo automatizado..."}
    background_tasks.add_task(run_install_full, job_id)
    return {"job_id": job_id}

async def run_install_demucs(job_id: str):
    import subprocess
    import asyncio
    CREATE_NO_WINDOW = 0x08000000 if os.name == 'nt' else 0
    cmd_args = ['python', '-m', 'pip', 'install', 'demucs']
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd_args,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=CREATE_NO_WINDOW
        )
    except FileNotFoundError:
        studio_install_jobs[job_id] = {"status": "error", "message": "O Python não está instalado neste computador! Instale o Python primeiro."}
        return
        
    while True:
        line = await process.stdout.readline()
        if not line:
            break
        text = line.decode(errors='replace').strip()
        if text:
            studio_install_jobs[job_id]["message"] = text
    
    await process.wait()
    if process.returncode == 0:
        studio_install_jobs[job_id]["status"] = "success"
        studio_install_jobs[job_id]["message"] = "Inteligência Artificial instalada com sucesso!"
    else:
        studio_install_jobs[job_id]["status"] = "error"
        studio_install_jobs[job_id]["message"] = f"Erro na instalação (código {process.returncode})."

@router.post("/api/studio/install")
async def studio_install(background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    studio_install_jobs[job_id] = {"status": "processing", "message": "Iniciando instalação do Demucs..."}
    background_tasks.add_task(run_install_demucs, job_id)
    return {"job_id": job_id}

@router.get("/api/studio/install/status/{job_id}")
def get_studio_install_status(job_id: str):
    if job_id not in studio_install_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return studio_install_jobs[job_id]

