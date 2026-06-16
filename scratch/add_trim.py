import re

def add_trim_audio_to_main():
    with open('backend/main.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    code_to_insert = """
class TrimAudioRequest(BaseModel):
    file_path: str
    start_ms: int
    end_ms: int

@app.post("/api/trim_audio")
async def trim_audio(req: TrimAudioRequest):
    import subprocess
    import shutil
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")
    
    temp_path = req.file_path + ".tmp"
    try:
        start_s = req.start_ms / 1000.0
        end_s = req.end_ms / 1000.0
        
        cmd = [
            "ffmpeg", "-y",
            "-i", req.file_path,
            "-ss", str(start_s),
            "-to", str(end_s),
            "-map_metadata", "0",
            temp_path
        ]
        
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
        proc = subprocess.run(cmd, startupinfo=startupinfo, capture_output=True, text=True)
        if proc.returncode != 0:
            print("FFMPEG ERROR:", proc.stderr)
            raise HTTPException(status_code=500, detail="Erro no FFMPEG ao cortar áudio.")
            
        shutil.move(temp_path, req.file_path)
        return {"status": "ok", "message": "Áudio cortado com sucesso"}
        
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise HTTPException(status_code=500, detail=str(e))
"""
    
    if "class TrimAudioRequest" not in content:
        # Insert before if __name__ == "__main__":
        parts = content.split('if __name__ == "__main__":')
        new_content = parts[0] + code_to_insert + '\nif __name__ == "__main__":' + parts[1]
        
        with open('backend/main.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
            
add_trim_audio_to_main()
