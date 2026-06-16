import re

# Fix AudioTrimmerModal
with open('frontend/src/components/AudioTrimmerModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

correct_url_logic = """
      let audioUrl = '';
      if (song.file_path) {
        const urlPath = song.file_path.split(/[\\\\\\/]/).map(encodeURIComponent).join('/');
        audioUrl = getApiUrl(`/downloads/${urlPath}?t=${Date.now()}`);
      } else if (song.video_id) {
        audioUrl = getApiUrl(`/stream/${song.video_id}?t=${Date.now()}`);
      }
      
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#A8C7FA',
        progressColor: '#0A56D1',
        cursorColor: '#0A56D1',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 100,
        url: audioUrl,
      });
"""

import re
content = re.sub(r'const ws = WaveSurfer\.create\(\{[\s\S]*?url:[^\}]*\}\);', correct_url_logic.strip(), content)

with open('frontend/src/components/AudioTrimmerModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

# Fix SettingsModal (Music is not defined)
with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace("<Music size={16} />", "<span>🎵</span>")

with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content2)

