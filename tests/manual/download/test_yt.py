import yt_dlp  
ydl_opts = {'quiet': False, 'extract_flat': 'in_playlist', 'cookiefile': 'backend/cookies.txt', 'js_runtimes': {'node': {}}, 'remote_components': ['ejs:github']}  
with yt_dlp.YoutubeDL(ydl_opts) as ydl:  
    info = ydl.extract_info('https://www.youtube.com/watch?v=rpk59gQBRWU', download=False)  
    print('SUCCESS!', info.get('title'))  
