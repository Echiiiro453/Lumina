import re

def inject_scrobble():
    with open('frontend/src/components/PlayerBar.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Add a ref for tracking if scrobbled
    if "const scrobbledRef = useRef(false);" not in content:
        content = content.replace(
            "const audioRef = useRef(null);",
            "const audioRef = useRef(null);\n  const scrobbledRef = useRef(false);"
        )
        
    # Reset scrobble flag when song changes
    if "scrobbledRef.current = false;" not in content:
        content = content.replace(
            "fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)",
            "scrobbledRef.current = false;\n      fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)"
        )
        
    # Inject into handleTimeUpdate
    if "/api/scrobble" not in content:
        scrobble_logic = """
      // Scrobble when 50% played
      if (!scrobbledRef.current && dur > 30 && curr >= dur * 0.5) {
        scrobbledRef.current = true;
        try {
          const artist = metadata?.artist || currentSong.artist;
          const title = metadata?.title || currentSong.title;
          if (artist && title) {
            fetch(`${window.location.protocol}//${window.location.hostname}:8000/api/scrobble`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artist, title })
            }).catch(()=>{});
          }
        } catch(e) {}
      }
"""
        content = content.replace(
            "setDuration(dur || 0);",
            "setDuration(dur || 0);\n" + scrobble_logic
        )
        
    with open('frontend/src/components/PlayerBar.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

inject_scrobble()
