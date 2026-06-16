from fastapi import APIRouter, HTTPException
import os
import asyncio

from database import get_conn

router = APIRouter()

@router.get("/api/settings/concurrent_downloads")
def get_concurrent_downloads():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'concurrent_downloads'")
        row = cur.fetchone()
        conn.close()
        return {"value": int(row['value']) if row else 2}
    except:
        return {"value": 2}

@router.post("/api/settings/concurrent_downloads")
def set_concurrent_downloads(body: dict):
    import downloader
    try:
        value = max(1, min(8, int(body.get("value", 2))))
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('concurrent_downloads', ?)", (str(value),))
        conn.commit()
        conn.close()
        # Update the live semaphore so it takes effect immediately without restart
        downloader.download_sem = asyncio.Semaphore(value)
        print(f"[Settings] Concurrent downloads updated to {value}")
        return {"status": "ok", "value": value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/settings/start_minimized")
def get_start_minimized():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'start_minimized'")
        row = cur.fetchone()
        conn.close()
        return {"value": row[0] == 'true' if row else False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/api/settings/start_minimized")
def set_start_minimized(body: dict):
    value = body.get('value', False)
    try:
        conn = get_conn()
        cur = conn.cursor()
        val_str = 'true' if value else 'false'
        cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('start_minimized', ?)", (val_str,))
        conn.commit()
        conn.close()
        return {"status": "ok", "value": value}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/settings/download_folder")
def get_download_folder():
    from utils import get_downloads_dir
    return {"folder": get_downloads_dir()}

@router.post("/api/settings/choose_folder")
def choose_folder():
    import threading
    result_folder = {"folder": ""}
    
    def open_dialog():
        try:
            import tkinter as tk
            from tkinter import filedialog
            from database import get_conn
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            folder_path = filedialog.askdirectory(title="Selecione a Pasta de Downloads")
            if folder_path:
                try:
                    conn = get_conn()
                    cur = conn.cursor()
                    cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('download_folder', ?)", (folder_path,))
                    conn.commit()
                    conn.close()
                    result_folder["folder"] = folder_path
                except Exception as e:
                    print("Erro ao salvar pasta:", e)
            root.destroy()
        except Exception as e:
            print("Erro dialog tkinter:", e)

    t = threading.Thread(target=open_dialog)
    t.start()
    t.join()
    
    if result_folder["folder"]:
        return {"status": "ok", "folder": result_folder["folder"]}
    else:
        raise HTTPException(status_code=400, detail="Nenhuma pasta selecionada")

@router.get("/api/settings/lastfm")
def get_lastfm():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = 'lastfm_username'")
        row = cur.fetchone()
        conn.close()
        return {"username": row['value'] if row else ""}
    except Exception as e:
        return {"username": ""}

@router.post("/api/settings/lastfm")
def set_lastfm(body: dict):
    username = body.get("username", "")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('lastfm_username', ?)", (username,))
        conn.commit()
        conn.close()
        return {"status": "ok", "username": username}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
