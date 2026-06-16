import re

with open('frontend/src/components/PlayerBar.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """          const fallbackArtist = currentSong.title?.includes(' - ') ? currentSong.title.split(' - ')[0].trim() : 'Unknown Artist';
          const fallbackTitle = currentSong.title?.includes(' - ') ? currentSong.title.split(' - ')[1].trim() : currentSong.title;
          
          const artist = metadata?.artist || currentSong.artist || fallbackArtist;
          const title = metadata?.title || fallbackTitle;"""

content = content.replace(
    "          const artist = metadata?.artist || currentSong.artist;\n          const title = metadata?.title || currentSong.title;",
    replacement
)

with open('frontend/src/components/PlayerBar.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
