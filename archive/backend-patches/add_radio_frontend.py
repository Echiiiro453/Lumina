import os

# Patch App.jsx for Infinite Radio
app_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx"
with open(app_path, "r", encoding="utf-8") as f:
    content = f.read()

app_old = """      if (currentIndex !== -1 && currentIndex + 1 < currentPlaylist.length) {
        const nextSong = currentPlaylist[currentIndex + 1];
        setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local" });
      }
    };"""

app_new = """      if (currentIndex !== -1 && currentIndex + 1 < currentPlaylist.length) {
        const nextSong = currentPlaylist[currentIndex + 1];
        setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local" });
      } else {
        // Infinite Radio: fetch similar track
        fetch('http://localhost:8000/api/radio/next', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seed_title: currentSong.title })
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                setCurrentSong({ title: data.title, file: data.url, quality: "Lumina Radio", video_id: data.video_id, coverUrl: data.thumbnail });
            }
        }).catch(err => console.error("Radio fail:", err));
      }
    };"""

content = content.replace(app_old, app_new)
with open(app_path, "w", encoding="utf-8") as f:
    f.write(content)

# Patch PlayerBar.jsx to allow HTTP stream URLs
player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    player_content = f.read()

player_old = """      if (currentSong.file) {
        const urlPath = currentSong.file.split(/[\\\\/]/).map(encodeURIComponent).join('/');
        const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
        const url = `${baseUrl}/downloads/${urlPath}`;"""

player_new = """      if (currentSong.file) {
        const urlPath = currentSong.file.split(/[\\\\/]/).map(encodeURIComponent).join('/');
        const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
        const url = currentSong.file.startsWith('http') ? currentSong.file : `${baseUrl}/downloads/${urlPath}`;"""

player_content = player_content.replace(player_old, player_new)

# Make sure metadata logic doesn't crash on http stream URLs
meta_old = """        // Fetch embedded lyrics & cover from backend
        fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)
          .then(res => res.json())"""

meta_new = """        // Fetch embedded lyrics & cover from backend
        if (!currentSong.file.startsWith('http')) {
        fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)
          .then(res => res.json())
          .then(data => {
              if (data.cover_b64) {
                 data.coverUrl = `data:${data.mime_type};base64,${data.cover_b64}`;
              }
              setMetadata(data);
              
              if (data.artist) {
                  fetch(`${baseUrl}/api/artist_info?artist=${encodeURIComponent(data.artist)}`)
                    .then(r => r.json())
                    .then(artistData => {
                        if (artistData.status === 'success' && artistData.picture) {
                            setArtistPhoto(artistData.picture);
                        } else {
                            setArtistPhoto(null);
                        }
                    }).catch(() => setArtistPhoto(null));
              } else {
                  setArtistPhoto(null);
              }
          })
          .catch(err => console.error("Error fetching metadata", err));
        } else {
            setMetadata({ title: currentSong.title, coverUrl: currentSong.coverUrl });
            setArtistPhoto(currentSong.coverUrl); // Fallback to video thumbnail
        }
        // Dummy wrapper so we can replace cleanly"""

player_content = player_content.replace(
    "        fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)\n          .then(res => res.json())\n          .then(data => {\n              if (data.cover_b64) {\n                 data.coverUrl = `data:${data.mime_type};base64,${data.cover_b64}`;\n              }\n              setMetadata(data);\n              \n              // Fetch Artist Photo via Deezer if artist exists\n              if (data.artist) {\n                  fetch(`${baseUrl}/api/artist_info?artist=${encodeURIComponent(data.artist)}`)\n                    .then(r => r.json())\n                    .then(artistData => {\n                        if (artistData.status === 'success' && artistData.picture) {\n                            setArtistPhoto(artistData.picture);\n                        } else {\n                            setArtistPhoto(null);\n                        }\n                    }).catch(() => setArtistPhoto(null));\n              } else {\n                  setArtistPhoto(null);\n              }\n          })\n          .catch(err => console.error(\"Error fetching metadata\", err));",
    meta_new
)

with open(player_path, "w", encoding="utf-8") as f:
    f.write(player_content)

print("Updated Infinite Radio logic")
