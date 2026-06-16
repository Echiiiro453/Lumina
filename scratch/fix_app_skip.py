with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

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
