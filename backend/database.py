import sqlite3
import os
import time
from utils import get_data_dir

DB_PATH = os.path.join(get_data_dir(), "downloads.db")

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS downloads (
                playlist_id TEXT,
                video_id    TEXT,
                title       TEXT,
                file_path   TEXT,
                status      TEXT,
                created_at  REAL,
                url         TEXT,
                PRIMARY KEY (playlist_id, video_id)
            );
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_video_id ON downloads (video_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_title ON downloads (title);")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS app_settings (
                key     TEXT PRIMARY KEY,
                value   TEXT
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS favorites (
                video_id   TEXT PRIMARY KEY,
                title      TEXT,
                file_path  TEXT,
                added_at   REAL
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS jobs_queue (
                job_id TEXT PRIMARY KEY,
                request_json TEXT,
                status TEXT,
                created_at REAL
            );
        """)
        try:
            cur.execute("ALTER TABLE downloads ADD COLUMN url TEXT;")
        except: 
            pass
        conn.commit()
        conn.close()
        print("Banco de dados SQLite inicializado.")
    except Exception as e:
        print(f"Erro ao inicializar DB: {e}")

def add_favorite(video_id: str, title: str, file_path: str) -> bool:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT OR IGNORE INTO favorites (video_id, title, file_path, added_at)
            VALUES (?, ?, ?, ?);
        """, (video_id, title, file_path, time.time()))
        changed = cur.rowcount > 0
        conn.commit()
        conn.close()
        return changed
    except Exception as e:
        print(f"Erro ao adicionar favorito: {e}")
        return False

def remove_favorite(video_id: str) -> bool:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM favorites WHERE video_id = ?;", (video_id,))
        changed = cur.rowcount > 0
        conn.commit()
        conn.close()
        return changed
    except Exception as e:
        print(f"Erro ao remover favorito: {e}")
        return False

def get_favorites() -> list:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT video_id, title, file_path, added_at FROM favorites ORDER BY added_at DESC;")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e:
        print(f"Erro ao buscar favoritos: {e}")
        return []

def is_favorite(video_id: str) -> bool:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM favorites WHERE video_id = ?;", (video_id,))
        result = cur.fetchone() is not None
        conn.close()
        return result
    except:
        return False

def mark_downloaded_db(playlist_id: str, video_id: str, title: str, file_path: str, url: str = None):
    # Use 'single' as fallback playlist_id for avulso downloads (no playlist context)
    effective_playlist_id = playlist_id or 'single'
    if not video_id: return
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT OR REPLACE INTO downloads
            (playlist_id, video_id, title, file_path, status, created_at, url)
            VALUES (?, ?, ?, ?, 'downloaded', ?, ?);
        """, (effective_playlist_id, video_id, title, file_path, time.time(), url))
        conn.commit()
        conn.close()
        print(f"  [DB] Salvo: playlist={effective_playlist_id} | video={video_id} | {title[:50]}")
    except Exception as e:
        print(f"Erro ao salvar no DB: {e}")

def mark_error_db(playlist_id: str, video_id: str, title: str, error_msg: str):
    effective_playlist_id = playlist_id or 'single'
    if not video_id: return
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("""
            INSERT OR REPLACE INTO downloads
            (playlist_id, video_id, title, file_path, status, created_at)
            VALUES (?, ?, ?, '', ?, ?);
        """, (effective_playlist_id, video_id, title, f"error:{error_msg[:180]}", time.time()))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao salvar erro no DB: {e}")

def get_downloaded_ids(playlist_id: str) -> list[str]:
    """
    Returns video_ids that are 'downloaded'.
    Checks both:
    1. Videos downloaded under this exact playlist_id
    2. Videos downloaded under ANY source (avulso, other playlists)
    This prevents re-downloading a video just because it came from a different origin.
    """
    if not playlist_id: return []
    try:
        conn = get_conn()
        cur = conn.cursor()
        # First: get video_ids for this playlist
        cur.execute(
            "SELECT video_id FROM downloads WHERE playlist_id = ? AND status = 'downloaded';",
            (playlist_id,)
        )
        by_playlist = {r["video_id"] for r in cur.fetchall() if r["video_id"]}

        # Second: get ALL downloaded video_ids globally
        cur.execute(
            "SELECT video_id FROM downloads WHERE status = 'downloaded' AND video_id IS NOT NULL AND video_id != '';"
        )
        global_ids = {r["video_id"] for r in cur.fetchall()}

        conn.close()
        return list(by_playlist | global_ids)
    except:
        return []


def mark_missing_db(playlist_id: str, video_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("UPDATE downloads SET status = 'missing' WHERE playlist_id = ? AND video_id = ?;", (playlist_id, video_id))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao marcar missing: {e}")

def get_download_record(playlist_id: str, video_id: str) -> dict:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT playlist_id, video_id, title, url FROM downloads WHERE playlist_id = ? AND video_id = ?;", (playlist_id, video_id))
        row = cur.fetchone()
        conn.close()
        return dict(row) if row else None
    except:
        return None

def sync_db_with_disk(downloads_dir: str) -> dict:
    """
    Varre todos os registros 'downloaded' no banco e verifica se os arquivos ainda existem no disco.
    Arquivos deletados sao marcados como 'missing' automaticamente.
    Também escaneia a pasta de downloads e importa arquivos de áudio órfãos para o banco.
    """
    checked = 0
    marked_missing = 0
    imported_local = 0
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT playlist_id, video_id, file_path FROM downloads WHERE status = 'downloaded';")
        rows = cur.fetchall()
        
        db_files = set()
        
        # 1. Verifica arquivos que já estão no banco
        for row in rows:
            checked += 1
            file_path = row["file_path"]
            if not file_path:
                continue
            
            abs_path = file_path if os.path.isabs(file_path) else os.path.join(downloads_dir, file_path)
            
            if not os.path.exists(abs_path):
                cur.execute(
                    "UPDATE downloads SET status = 'missing' WHERE playlist_id = ? AND video_id = ?;",
                    (row["playlist_id"], row["video_id"])
                )
                marked_missing += 1
            else:
                db_files.add(os.path.basename(abs_path))
        
        # 2. Importa arquivos locais órfãos
        import uuid
        if os.path.exists(downloads_dir):
            for root, dirs, files in os.walk(downloads_dir):
                for file in files:
                    if file.lower().endswith(('.mp3', '.m4a', '.wav', '.flac', '.ogg')):
                        if file not in db_files:
                            rel_path = os.path.relpath(os.path.join(root, file), downloads_dir)
                            pseudo_id = "local_" + str(uuid.uuid4())[:8]
                            title = os.path.splitext(file)[0]
                            
                            cur.execute("""
                                INSERT OR REPLACE INTO downloads
                                (playlist_id, video_id, title, file_path, status, created_at, url)
                                VALUES (?, ?, ?, ?, 'downloaded', ?, ?);
                            """, ('local_folder', pseudo_id, title, rel_path, time.time(), ''))
                            imported_local += 1
                            db_files.add(file)
        
        conn.commit()
        conn.close()
        
        msg = f"[DB SYNC] Concluido: {checked} verificados, {marked_missing} marcados ausentes, {imported_local} importados locais."
        print(msg)
    except Exception as e:
        print(f"Erro no sync_db_with_disk: {e}")
    
    return {"checked": checked, "marked_missing": marked_missing, "imported_local": imported_local}


def set_setting(key: str, value: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);", (key, value))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao salvar setting: {e}")

def get_setting(key: str, default: str = None) -> str:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = ?;", (key,))
        row = cur.fetchone()
        conn.close()
        return row["value"] if row else default
    except:
        return default

def add_job_to_queue(job_id: str, request_json: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO jobs_queue (job_id, request_json, status, created_at) VALUES (?, ?, 'pending', ?);", (job_id, request_json, time.time()))
        conn.commit()
        conn.close()
    except Exception as e: print(f"Erro add_job: {e}")

def remove_job_from_queue(job_id: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM jobs_queue WHERE job_id = ?;", (job_id,))
        conn.commit()
        conn.close()
    except Exception as e: print(f"Erro remove_job: {e}")

def get_pending_jobs_from_queue() -> list:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT job_id, request_json FROM jobs_queue ORDER BY created_at ASC;")
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        return rows
    except Exception as e: 
        print(f"Erro get_jobs: {e}")
        return []
