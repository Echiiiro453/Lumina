import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_install = """        # Install Python silently
        import asyncio
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

good_install = """        # Install Python silently
        import subprocess
        subprocess.run([installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0"], check=True)
        
        studio_jobs[job_id] = {"status": "processing", "progress": 50, "message": "Instalando Motor de IA (Download de 2.5 GB, aguarde)..."}
        
        # Find Python executable
        local_app_data = os.environ.get('LOCALAPPDATA', '')
        python_exe = os.path.join(local_app_data, "Programs", "Python", "Python310", "python.exe")
        if not os.path.exists(python_exe):
            python_exe = "python" # fallback to path
            
        subprocess.run([python_exe, "-m", "pip", "install", "demucs"], check=True)"""

content = content.replace(bad_install, good_install)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
