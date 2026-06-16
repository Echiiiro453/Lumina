import re

with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace setCurrentSong for local songs in App.jsx
content = re.sub(
    r'setCurrentSong\(\{ title: (.*?), file: (.*?), quality: "Local", thumbnail: (.*?) \}\);',
    r'setCurrentSong({ title: \1, file: \2, quality: "Local", thumbnail: \3, video_id: \1.replace(".title", ".video_id") if "title" in \1 else \3 });',
    content
)

# Actually the regex might be tricky, let's use exact replace
content = content.replace(
    'setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local", thumbnail: nextSong.thumbnail });',
    'setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local", thumbnail: nextSong.thumbnail, video_id: nextSong.video_id });'
)

content = content.replace(
    'setCurrentSong({ title: prevSong.title, file: prevSong.file_path, quality: "Local", thumbnail: prevSong.thumbnail });',
    'setCurrentSong({ title: prevSong.title, file: prevSong.file_path, quality: "Local", thumbnail: prevSong.thumbnail, video_id: prevSong.video_id });'
)

with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

with open('frontend/src/components/LibraryModal.jsx', 'r', encoding='utf-8') as f:
    lib_content = f.read()

lib_content = lib_content.replace(
    "onClick={() => onPlaySong({ title: song.title, file: song.file_path, quality: 'Local' }, queue)}",
    "onClick={() => onPlaySong({ title: song.title, file: song.file_path, quality: 'Local', video_id: song.video_id, thumbnail: song.thumbnail }, queue)}"
)

with open('frontend/src/components/LibraryModal.jsx', 'w', encoding='utf-8') as f:
    f.write(lib_content)
