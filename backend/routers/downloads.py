from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import uuid
import time
import os
from dataclasses import asdict

from utils import get_downloads_dir, clean_url
from database import add_job_to_queue, mark_missing_db, get_download_record
from downloader import jobs, download_queue, JobState, ERROR_CODE_CANCELLED

router = APIRouter()

class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"
    format: str = "mp3"
    mode: str = "audio"
    playlist: bool = False
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    pitch: int = 0
    speed: float = 1.0
    title: Optional[str] = None
    artist: Optional[str] = None
    cover_path: Optional[str] = None
    browser_cookies: Optional[str] = None
    video_codec: Optional[str] = "auto"
    compress_video: Optional[bool] = False
    cookies_path: Optional[str] = None
    eq_preset: Optional[str] = None
    playlist_id: Optional[str] = None
    video_id: Optional[str] = None
    organize: bool = False
    organize_by_playlist: bool = False

class RetryRequest(BaseModel):
    playlist_id: str
    video_id: str

@router.post("/download/retry")
async def retry_download(req: RetryRequest):
    rec = get_download_record(req.playlist_id, req.video_id)
    if not rec: raise HTTPException(status_code=404, detail="Não encontrado no histórico")
    mark_missing_db(req.playlist_id, req.video_id)
    url = rec.get("url") or f"https://www.youtube.com/watch?v={rec['video_id']}"
    
    dreq = DownloadRequest(url=url, playlist_id=req.playlist_id, video_id=req.video_id, title=rec.get("title"))
    job_id = str(uuid.uuid4())
    jobs[job_id] = JobState(id=job_id, status="queued", progress=0.0, created_at=time.time(), title=rec.get("title"))
    add_job_to_queue(job_id, dreq.json())
    await download_queue.put((job_id, dreq))
    return {"status": "ok", "job_id": job_id}

@router.post("/download/enqueue")
@router.post("/download")
async def enqueue_download(req: DownloadRequest):
    req.url = clean_url(req.url)
    job_id = str(uuid.uuid4())
    jobs[job_id] = JobState(id=job_id, status="queued", progress=0.0, created_at=time.time(), title=req.title)
    add_job_to_queue(job_id, req.json())
    await download_queue.put((job_id, req))
    return {"job_id": job_id}

@router.post("/download/cancel/{job_id}")
async def cancel_download(job_id: str):
    if job_id in jobs:
        jobs[job_id].status = "cancelled"
        jobs[job_id].error_code = ERROR_CODE_CANCELLED
        jobs[job_id].error = "Cancelado pelo usuário"
        return {"job_id": job_id, "status": "cancelled"}
    raise HTTPException(status_code=404, detail="Job not found")

@router.get("/download/status/{job_id}")
async def get_download_status(job_id: str):
    st = jobs.get(job_id)
    if not st: raise HTTPException(status_code=404, detail="Not found")
    return asdict(st)

@router.get("/download/jobs")
async def get_all_jobs():
    return {job_id: asdict(state) for job_id, state in jobs.items()}

@router.post("/open_folder")
def open_folder():
    downloads_dir = get_downloads_dir()
    if os.path.exists(downloads_dir): os.startfile(downloads_dir)
    return {"status": "opened"}
