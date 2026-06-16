from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from database import add_favorite, remove_favorite, get_favorites, is_favorite, get_downloaded_ids
import subscriptions

router = APIRouter()

class FavoriteRequest(BaseModel):
    video_id: str
    title: str
    channel: str = ""
    duration: int = 0
    thumbnail: str = ""

@router.get("/api/favorites")
def api_get_favorites():
    return {"favorites": get_favorites()}

@router.post("/api/favorites/add")
def api_add_favorite(req: FavoriteRequest):
    success = add_favorite(req.video_id, req.title, req.channel, req.duration, req.thumbnail)
    return {"success": success}

@router.delete("/api/favorites/{video_id}")
def api_remove_favorite(video_id: str):
    success = remove_favorite(video_id)
    return {"success": success}

@router.get("/api/favorites/check/{video_id}")
def api_check_favorite(video_id: str):
    return {"is_favorite": is_favorite(video_id)}

@router.get("/api/history")
def api_history(limit: int = 200):
    from database import sync_db_with_disk, get_conn
    from utils import get_downloads_dir
    sync_db_with_disk(get_downloads_dir())
    conn = get_conn()
    c = conn.cursor()
    c.execute('SELECT playlist_id, video_id, title, file_path, status, created_at, url FROM downloads ORDER BY created_at DESC LIMIT ?', (limit,))
    rows = c.fetchall()
    
    c.execute('SELECT COUNT(*) as total FROM downloads')
    total = c.fetchone()['total']
    conn.close()
    
    history = []
    for r in rows:
        history.append({
            "playlist_id": r['playlist_id'],
            "video_id": r['video_id'],
            "title": r['title'],
            "file_path": r['file_path'],
            "status": r['status'],
            "error": "",
            "created_at": r['created_at'],
            "url": r['url']
        })
    return {"history": history, "total": total}

@router.get("/api/library")
def api_library():
    from database import sync_db_with_disk, get_conn
    from utils import get_downloads_dir
    sync_db_with_disk(get_downloads_dir())
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT playlist_id, video_id, title, file_path, created_at, url FROM downloads WHERE status = 'downloaded' ORDER BY created_at DESC;")
    rows = c.fetchall()
    conn.close()
    
    library = []
    for r in rows:
        library.append({
            "playlist_id": r['playlist_id'],
            "video_id": r['video_id'],
            "title": r['title'],
            "file_path": r['file_path'],
            "created_at": r['created_at'],
            "url": r['url']
        })
    return {"library": library}

@router.delete("/api/history/{video_id}")
def api_delete_history(video_id: str):
    from database import get_conn
    conn = get_conn()
    c = conn.cursor()
    c.execute('DELETE FROM downloads WHERE video_id = ?', (video_id,))
    conn.commit()
    conn.close()
    return {"success": True}

class SubRequest(BaseModel):
    playlist_id: str = None
    url: str = None
    title: str = None
    platform: str = "youtube"

@router.get("/api/subscriptions")
def api_get_subscriptions():
    return subscriptions.get_all_subscriptions()

@router.post("/api/subscriptions/add")
def api_add_subscription(req: SubRequest):
    p_id = req.playlist_id if req.playlist_id else req.url
    success = subscriptions.add_subscription(p_id, req.url, req.title, req.platform)
    if success:
        return {"success": True, "message": "Inscrito com sucesso"}
    return {"success": False, "message": "Já inscrito nesta playlist"}

@router.post("/api/subscriptions/remove")
def api_remove_subscription(req: dict):
    playlist_id = req.get("playlist_id")
    if playlist_id:
        subscriptions.remove_subscription(playlist_id)
        return {"success": True}
    return {"success": False, "message": "ID não fornecido"}

@router.get("/api/subscriptions/{playlist_id:path}/downloads")
def api_get_subscription_downloads(playlist_id: str):
    downloaded = get_downloaded_ids(playlist_id)
    return {"playlist_id": playlist_id, "downloaded_video_ids": downloaded}
