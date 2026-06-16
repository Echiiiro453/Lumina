import os
import re

main_path = r"e:\youtubr\youtubeMusicDownload-main\backend\main.py"
with open(main_path, "r", encoding="utf-8") as f:
    content = f.read()

open_external_old = """@app.post("/api/open_external")
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
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

open_external_new = """@app.post("/api/open_external")
def open_external(request: OpenExternalRequest):
    try:
        from utils import get_downloads_dir
        import subprocess
        abs_path = os.path.join(get_downloads_dir(), request.file_path)
        if not os.path.exists(abs_path):
            raise HTTPException(status_code=404, detail="File not found")
            
        if os.name == 'nt':
            # Select the file in Windows Explorer instead of executing it
            subprocess.run(['explorer', '/select,', os.path.normpath(abs_path)])
        elif sys.platform == 'darwin':
            subprocess.call(('open', '-R', abs_path))
        else:
            subprocess.call(('xdg-open', os.path.dirname(abs_path)))
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))"""

content = content.replace(open_external_old, open_external_new)

with open(main_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated /api/open_external in main.py")
