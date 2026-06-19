import re

file_path = 'e:/youtubr/youtubeMusicDownload-main/frontend/src/components/PlayerBar.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add timeout ref and clear it
# Search for: const deckGainBRef = useRef(null);
target_refs = "const deckGainBRef = useRef(null);"
replace_refs = "const deckGainBRef = useRef(null);\n  const crossfadeTimeoutRef = useRef(null);"
code = code.replace(target_refs, replace_refs)

# At the start of useEffect:
target_useeffect = """  useEffect(() => {
    if (!currentSong) return;

    // Reset state for new song"""
replace_useeffect = """  useEffect(() => {
    if (!currentSong) return;
    
    // QA Race Condition Fix (Clear orphaned timeouts on rapid skip)
    if (crossfadeTimeoutRef.current) {
        clearTimeout(crossfadeTimeoutRef.current);
    }

    // Reset state for new song"""
code = code.replace(target_useeffect, replace_useeffect)

# Replace setTimeout with tracked timeout (Stream mode)
target_timeout_stream = """            // Stop old song after crossfade
            setTimeout(() => {
              if (currentAudio) currentAudio.pause();
            }, crossfadeTime * 1000);"""
replace_timeout_stream = """            // Stop old song after crossfade
            crossfadeTimeoutRef.current = setTimeout(() => {
              if (currentAudio) currentAudio.pause();
            }, crossfadeTime * 1000);"""
code = code.replace(target_timeout_stream, replace_timeout_stream)

# Replace setTimeout with tracked timeout (Local mode)
target_timeout_local = """              setTimeout(() => {
                if (currentAudio) currentAudio.pause();
              }, crossfadeTime * 1000);"""
replace_timeout_local = """              crossfadeTimeoutRef.current = setTimeout(() => {
                if (currentAudio) currentAudio.pause();
              }, crossfadeTime * 1000);"""
code = code.replace(target_timeout_local, replace_timeout_local)

# 2. Add Anti-Denormal Dithering (Noise Floor) to initAudioVisualizer
# Find where sourceA and sourceB connect to source.
target_dither = """      const source = audioCtx.createGain(); // Mixer bus
      sourceA.connect(gainA); gainA.connect(source);
      sourceB.connect(gainB); gainB.connect(source);"""

replace_dither = """      const source = audioCtx.createGain(); // Mixer bus
      sourceA.connect(gainA); gainA.connect(source);
      sourceB.connect(gainB); gainB.connect(source);

      // QA Denormal Number Fix (Inject 1e-15 DC Noise Floor)
      // This prevents the CPU from spiking when Reverb tails hit zero.
      const ditherBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      const ditherData = ditherBuffer.getChannelData(0);
      for(let i=0; i<ditherData.length; i++) ditherData[i] = (Math.random() * 2 - 1) * 1e-10; // -200dBFS noise
      const ditherSrc = audioCtx.createBufferSource();
      ditherSrc.buffer = ditherBuffer;
      ditherSrc.loop = true;
      ditherSrc.start();
      ditherSrc.connect(source);"""
      
code = code.replace(target_dither, replace_dither)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Stability Fixes Applied.")
