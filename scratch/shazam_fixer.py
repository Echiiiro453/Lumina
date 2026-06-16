import asyncio
import os
import aiohttp
from shazamio import Shazam
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, TIT2, TPE1, TCON, APIC, error

async def _download_image(url: str) -> bytes:
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            if response.status == 200:
                return await response.read()
    return None

async def fix_mp3_metadata(file_path: str) -> dict:
    if not os.path.exists(file_path) or not file_path.lower().endswith(".mp3"):
        return {"success": False, "error": "Invalid MP3 file"}

    shazam = Shazam()
    try:
        res = await shazam.recognize(file_path)
    except Exception as e:
        return {"success": False, "error": f"Shazam API error: {e}"}

    if "track" not in res:
        return {"success": False, "error": "Song not recognized by Shazam"}

    track = res["track"]
    title = track.get("title", "")
    artist = track.get("subtitle", "")
    genre = track.get("genres", {}).get("primary", "")
    cover_url = track.get("images", {}).get("coverarthq")

    # Update metadata using mutagen
    try:
        audio = MP3(file_path, ID3=ID3)
    except error:
        audio = MP3(file_path)
        audio.add_tags()

    if audio.tags is None:
        audio.add_tags()

    if title:
        audio.tags.add(TIT2(encoding=3, text=title))
    if artist:
        audio.tags.add(TPE1(encoding=3, text=artist))
    if genre:
        audio.tags.add(TCON(encoding=3, text=genre))

    # Download and embed cover
    if cover_url:
        img_data = await _download_image(cover_url)
        if img_data:
            audio.tags.delall("APIC")
            audio.tags.add(APIC(
                encoding=3,
                mime='image/jpeg',
                type=3, # front cover
                desc='Cover',
                data=img_data
            ))

    audio.save()
    
    return {
        "success": True, 
        "title": title, 
        "artist": artist, 
        "genre": genre,
        "cover_url": cover_url
    }

def fix_metadata_sync(file_path: str) -> dict:
    return asyncio.run(fix_mp3_metadata(file_path))
