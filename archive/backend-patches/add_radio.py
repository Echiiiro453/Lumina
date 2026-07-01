import os

file_path = r"e:\youtubr\youtubeMusicDownload-main\backend\main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

radio_endpoint = """

class RadioRequest(BaseModel):
    seed_title: str

@app.post("/api/radio/next")
def api_radio_next(req: RadioRequest):
    import yt_dlp
    import random
    
    # We use ytsearch5 to get a mix of results and pick a random one
    # to simulate "infinite radio" without playing the same track over and over
    opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'noplaylist': True,
        'extract_flat': False,
        'cookiefile': get_cookies_path()
    }
    
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            # We search "{seed} mix auto-generated" or "audio" to get similar songs
            info = ydl.extract_info(f"ytsearch5:{req.seed_title} audio", download=False)
            if 'entries' in info and len(info['entries']) > 0:
                # Pick a random entry
                entry = random.choice(info['entries'])
                return {
                    "status": "success",
                    "title": entry.get('title'),
                    "url": entry.get('url'),
                    "video_id": entry.get('id'),
                    "thumbnail": entry.get('thumbnail') or f"https://i.ytimg.com/vi/{entry.get('id')}/mqdefault.jpg"
                }
            return {"status": "error", "detail": "No similar tracks found"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

"""

if "api_radio_next" not in content:
    content = content.replace("@app.get(\"/auth_status\")", radio_endpoint + "@app.get(\"/auth_status\")")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added /api/radio/next to main.py")
else:
    print("Already exists")
