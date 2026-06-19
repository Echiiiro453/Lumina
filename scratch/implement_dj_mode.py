import re
import os

file_path = 'e:/youtubr/youtubeMusicDownload-main/frontend/src/components/PlayerBar.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Replace audioRef definition
code = code.replace("const audioRef = useRef(null);", 
"""const audioRefA = useRef(null);
  const audioRefB = useRef(null);
  const [activeDeck, setActiveDeck] = useState('A');
  const [isCrossfading, setIsCrossfading] = useState(false);
  const deckGainARef = useRef(null);
  const deckGainBRef = useRef(null);
  
  const getActiveAudio = () => activeDeck === 'A' ? audioRefA.current : audioRefB.current;
  const getInactiveAudio = () => activeDeck === 'A' ? audioRefB.current : audioRefA.current;""")

# 2. Replace audioRef.current with getActiveAudio() in common places
# We have to be careful with assignments.
# Assignments like `audioRef.current.playbackRate =` -> `if(audioRefA.current) audioRefA.current.playbackRate = ...`

code = code.replace("audioRef.current.playbackRate =", "if(audioRefA.current) audioRefA.current.playbackRate = playbackRate; if(audioRefB.current) audioRefB.current.playbackRate =")
code = code.replace("audioRef.current.preservesPitch =", "if(audioRefA.current) audioRefA.current.preservesPitch = preservesPitch; if(audioRefB.current) audioRefB.current.preservesPitch =")
code = code.replace("audioRef.current.mozPreservesPitch =", "if(audioRefA.current) audioRefA.current.mozPreservesPitch = preservesPitch; if(audioRefB.current) audioRefB.current.mozPreservesPitch =")
code = code.replace("audioRef.current.webkitPreservesPitch =", "if(audioRefA.current) audioRefA.current.webkitPreservesPitch = preservesPitch; if(audioRefB.current) audioRefB.current.webkitPreservesPitch =")

code = code.replace("!audioRef.current", "(!audioRefA.current || !audioRefB.current)")

# 3. Handle initAudioVisualizer
init_target = """  const initAudioVisualizer = async () => {
    if ((!audioRefA.current || !audioRefB.current) || audioContextRef.current) return;
    let audioCtx = null, source = null;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      source = audioCtx.createMediaElementSource(audioRef.current);"""

init_replace = """  const initAudioVisualizer = async () => {
    if ((!audioRefA.current || !audioRefB.current) || audioContextRef.current) return;
    let audioCtx = null;
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      
      const sourceA = audioCtx.createMediaElementSource(audioRefA.current);
      const sourceB = audioCtx.createMediaElementSource(audioRefB.current);
      
      const gainA = audioCtx.createGain(); gainA.gain.value = 1.0;
      const gainB = audioCtx.createGain(); gainB.gain.value = 0.0;
      
      deckGainARef.current = gainA;
      deckGainBRef.current = gainB;
      
      const source = audioCtx.createGain(); // Mixer bus
      sourceA.connect(gainA); gainA.connect(source);
      sourceB.connect(gainB); gainB.connect(source);"""

code = code.replace(init_target, init_replace)

# 4. Handle streaming mode
stream_target = """      // 👉 Streaming mode: use the resolved audio URL directly 👈
      if (audioRef.current) {
        audioRef.current.src = currentSong.url;
        audioRef.current.volume = volume;
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.log("Auto-play prevented", err));
      }"""

stream_replace = """      // 👉 Streaming mode with DJ Crossfade 👈
      const nextAudio = getInactiveAudio();
      const currentAudio = getActiveAudio();
      const nextDeck = activeDeck === 'A' ? 'B' : 'A';
      
      if (nextAudio && audioContextRef.current) {
        nextAudio.src = currentSong.url;
        nextAudio.volume = volume;
        nextAudio.play().then(() => {
          setIsPlaying(true);
          
          // Crossfade logic
          const ctx = audioContextRef.current;
          const fadeOutGain = activeDeck === 'A' ? deckGainARef.current : deckGainBRef.current;
          const fadeInGain = activeDeck === 'A' ? deckGainBRef.current : deckGainARef.current;
          
          if (fadeOutGain && fadeInGain) {
            const now = ctx.currentTime;
            const crossfadeTime = 3.0; // 3 seconds DJ mix
            
            // Fade In New Song
            fadeInGain.gain.cancelScheduledValues(now);
            fadeInGain.gain.setValueAtTime(0, now);
            fadeInGain.gain.linearRampToValueAtTime(1.0, now + crossfadeTime);
            
            // Fade Out Old Song
            fadeOutGain.gain.cancelScheduledValues(now);
            fadeOutGain.gain.setValueAtTime(1.0, now);
            fadeOutGain.gain.linearRampToValueAtTime(0.0, now + crossfadeTime);
            
            // Stop old song after crossfade
            setTimeout(() => {
              if (currentAudio) currentAudio.pause();
            }, crossfadeTime * 1000);
          }
          
          setActiveDeck(nextDeck);
        }).catch(err => console.log("Auto-play prevented", err));
      } else if (currentAudio && !audioContextRef.current) {
        // Fallback se não inicializou WebAudio ainda
        currentAudio.src = currentSong.url;
        currentAudio.volume = volume;
        currentAudio.play().then(() => setIsPlaying(true));
      }"""

code = code.replace(stream_target, stream_replace)

# Other play/pause routines
code = code.replace("audioRef.current.pause()", "getActiveAudio()?.pause()")
code = code.replace("audioRef.current.play()", "getActiveAudio()?.play()")
code = code.replace("audioRef.current.currentTime", "getActiveAudio().currentTime")
code = code.replace("audioRef.current.duration", "getActiveAudio().duration")
code = code.replace("audioRef.current.volume", "getActiveAudio().volume")
code = code.replace("if (audioRef.current)", "if (getActiveAudio())")

# Render elements
audio_render_target = """        <audio
        ref={audioRef}
        crossOrigin="anonymous"
        onPlay={initAudioVisualizer}
        onEnded={() => {
          if (!isLooping && onNext) onNext();
        }}
      />"""

audio_render_replace = """        <audio
        ref={audioRefA}
        crossOrigin="anonymous"
        onPlay={initAudioVisualizer}
        onEnded={() => {
          if (activeDeck === 'A' && !isLooping && onNext) onNext();
        }}
      />
      <audio
        ref={audioRefB}
        crossOrigin="anonymous"
        onPlay={initAudioVisualizer}
        onEnded={() => {
          if (activeDeck === 'B' && !isLooping && onNext) onNext();
        }}
      />"""

code = code.replace(audio_render_target, audio_render_replace)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Replacement Complete.")
