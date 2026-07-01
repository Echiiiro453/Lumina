import os
import yt_dlp

VIDEO_URL = "https://www.youtube.com/watch?v=rpk59gQBRWU"

opts_working_cookies = {
    'quiet': False,
    'extract_flat': 'in_playlist',
    'cookiefile': 'backend/dist/AppMusica/cookies.txt',
    'js_runtimes': {'node': {}},
    'remote_components': ['ejs:github']
}

print("--- TESTING WITH WORKING COOKIES (FROM DIST) ---")
try:
    with yt_dlp.YoutubeDL(opts_working_cookies) as ydl:
        info = ydl.extract_info(VIDEO_URL, download=False)
        print("SUCCESS!", info.get('title'))
except Exception as e:
    print("FAILED:", e)
