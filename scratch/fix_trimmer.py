import re

def fix_trimmer():
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
    
    # Replace the old creation block
    old_block = """
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#A8C7FA',
        progressColor: '#0A56D1',
        cursorColor: '#0A56D1',
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        height: 100,
        url: getApiUrl(`/stream/${song.video_id}?t=${Date.now()}`),
      });
"""
    content = content.replace(old_block.strip(), correct_url_logic.strip())

    with open('frontend/src/components/AudioTrimmerModal.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

fix_trimmer()
