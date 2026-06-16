import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Fix trim_audio
trim_audio_orig = """        proc = subprocess.run(cmd, startupinfo=startupinfo, capture_output=True, text=True)
        if proc.returncode != 0:
            print("FFMPEG ERROR:", proc.stderr)
            raise HTTPException(status_code=500, detail="Erro no FFMPEG ao cortar áudio.")"""

trim_audio_new = """        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            print("FFMPEG ERROR:", stderr.decode('utf-8', errors='ignore'))
            raise HTTPException(status_code=500, detail="Erro no FFMPEG ao cortar áudio.")"""

# Replace in trim_audio (ignoring precise encoding characters just in case)
# Regex for safety
content = re.sub(
    r'proc = subprocess\.run\(cmd, startupinfo=startupinfo, capture_output=True, text=True\)\n\s+if proc\.returncode != 0:\n\s+print\("FFMPEG ERROR:", proc\.stderr\)\n\s+raise HTTPException\(status_code=500, detail="Erro no FFMPEG ao cortar .*?audio\."\)',
    trim_audio_new,
    content,
    flags=re.DOTALL
)


# 2. Fix apply_effects
apply_effects_orig = """    try:
        process = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW,
            text=True
        )
        
        if process.returncode != 0:
            if os.path.exists(output_path):
                os.remove(output_path)
            raise Exception(f"FFMPEG Error: {process.stderr}")"""

apply_effects_new = """    try:
        import asyncio
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=CREATE_NO_WINDOW
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode != 0:
            if os.path.exists(output_path):
                os.remove(output_path)
            raise Exception(f"FFMPEG Error: {stderr.decode('utf-8', errors='ignore')}")"""

content = re.sub(
    r'try:\n\s+process = subprocess\.run\(\n\s+cmd,\n\s+stdout=subprocess\.PIPE,\n\s+stderr=subprocess\.PIPE,\n\s+creationflags=CREATE_NO_WINDOW,\n\s+text=True\n\s+\)\n\s+if process\.returncode != 0:\n\s+if os\.path\.exists\(output_path\):\n\s+os\.remove\(output_path\)\n\s+raise Exception\(f"FFMPEG Error: \{process\.stderr\}"\)',
    apply_effects_new,
    content,
    flags=re.DOTALL
)


# 3. Fix Demucs Installation (which blocks the loop while downloading/installing)
demucs_install_orig = """        subprocess.run([installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0"], check=True)
        
        studio_jobs[job_id] = {"status": "processing", "progress": 50, "message": "Instalando Motor de IA (Download de 2.5 GB, aguarde)..."}
        
        # Find Python executable
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        python_exe = os.path.join(local_app_data, "Programs", "Python", "Python310", "python.exe")
        if not os.path.exists(python_exe):
            python_exe = "python" # fallback to path
            
        subprocess.run([python_exe, "-m", "pip", "install", "demucs"], check=True)"""

demucs_install_new = """        import asyncio
        proc = await asyncio.create_subprocess_exec(installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0")
        await proc.communicate()
        if proc.returncode != 0: raise Exception("Python installer failed")
        
        studio_jobs[job_id] = {"status": "processing", "progress": 50, "message": "Instalando Motor de IA (Download de 2.5 GB, aguarde)..."}
        
        # Find Python executable
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        python_exe = os.path.join(local_app_data, "Programs", "Python", "Python310", "python.exe")
        if not os.path.exists(python_exe):
            python_exe = "python" # fallback to path
            
        proc = await asyncio.create_subprocess_exec(python_exe, "-m", "pip", "install", "demucs")
        await proc.communicate()
        if proc.returncode != 0: raise Exception("Demucs pip install failed")"""

content = re.sub(
    r'subprocess\.run\(\[installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0"\], check=True\)\n\s+studio_jobs\[job_id\] = \{"status": "processing", "progress": 50, "message": "Instalando Motor de IA \(Download de 2\.5 GB, aguarde\)\.\.\."\}\n\s+# Find Python executable\n\s+local_app_data = os\.environ\.get\(\'LOCALAPPDATA\', \'\'\)\n\s+python_exe = os\.path\.join\(local_app_data, "Programs", "Python", "Python310", "python\.exe"\)\n\s+if not os\.path\.exists\(python_exe\):\n\s+python_exe = "python" # fallback to path\n\s+subprocess\.run\(\[python_exe, "-m", "pip", "install", "demucs"\], check=True\)',
    demucs_install_new,
    content,
    flags=re.DOTALL
)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
