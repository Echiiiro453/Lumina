import os

filepath = r"e:\youtubr\youtubeMusicDownload-main\README.md"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Replace AppMusica with Lumina globally in README
content = content.replace("AppMusica", "Lumina")

# Add new features to English section
en_features = """- **Magic Search**: Search and download songs by directly pasting Spotify, Deezer, SoundCloud, or Apple Music links.
- **Infinite Radio**: Automatically discover and stream similar tracks when your local playlist ends.
- **Sleep Timer & Crossfade**: Fall asleep to your music and enjoy gapless, smooth transitions between songs.
- **Discord Rich Presence**: Show off what you're listening to directly on your Discord status.
- **Lumina Sync**: Seamlessly sync your music to your mobile phone over local Wi-Fi with secure QR Code pairing.
"""
content = content.replace("- **Magic Search**: Search and download songs by directly pasting Spotify, Deezer, SoundCloud, or Apple Music links.", en_features)

# Add new features to Portuguese section
pt_features = """- **Busca Mágica**: Pesquise e baixe músicas colando links diretos do Spotify, Deezer, SoundCloud ou Apple Music.
- **Rádio Infinita (Auto-Mix)**: Descubra e transmita músicas semelhantes automaticamente quando sua lista de reprodução local terminar.
- **Sleep Timer e Crossfade**: Programe o app para desligar sozinho e desfrute de transições suaves e sem pausas entre as músicas.
- **Discord Rich Presence**: Mostre aos seus amigos do Discord o que você está ouvindo no momento.
- **Lumina Sync**: Sincronize suas músicas perfeitamente para o celular via Wi-Fi local, com pareamento seguro por QR Code.
"""
content = content.replace("- **Busca Mágica**: Pesquise e baixe músicas colando links diretos do Spotify, Deezer, SoundCloud ou Apple Music.", pt_features)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("README.md updated with Lumina and new features.")
