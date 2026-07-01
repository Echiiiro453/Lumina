import yt_dlp

opts_no_js = {'quiet': False, 'extract_flat': 'in_playlist', 'cookiefile': 'backend/cookies.txt'}
opts_yes_js = {'quiet': False, 'extract_flat': 'in_playlist', 'cookiefile': 'backend/cookies.txt', 'js_runtimes': {'node': {}}, 'remote_components': ['ejs:github']}

print('--- NO JS RUNTIME ---')
try:
    with yt_dlp.YoutubeDL(opts_no_js) as ydl:
        ydl.extract_info('https://www.youtube.com/watch?v=rpk59gQBRWU', download=False)
except Exception as e:
    print('ERROR:', e)

print('\n--- YES JS RUNTIME ---')
try:
    with yt_dlp.YoutubeDL(opts_yes_js) as ydl:
        ydl.extract_info('https://www.youtube.com/watch?v=rpk59gQBRWU', download=False)
except Exception as e:
    print('ERROR:', e)
