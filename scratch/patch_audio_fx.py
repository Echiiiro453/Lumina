import os
import re

file_path = r'e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add createReverbIR outside component
ir_func = """
const createReverbIR = (audioCtx, duration, decay) => {
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * duration;
  const impulse = audioCtx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);
  for (let i = 0; i < length; i++) {
    left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return impulse;
};

export function PlayerBar({ currentSong, onClose, onFinish, onNext, onPrev, isShuffle, setIsShuffle, onOpenArtist }) {
"""
content = content.replace("export function PlayerBar({ currentSong, onClose, onFinish, onNext, onPrev, isShuffle, setIsShuffle, onOpenArtist }) {", ir_func)

# 2. Add state variables inside PlayerBar
state_vars = """
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [preservesPitch, setPreservesPitch] = useState(true);
  const [reverbMix, setReverbMix] = useState(0.0);
  const reverbNodeRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);
"""
content = re.sub(
    r"(const \[isPlaying, setIsPlaying\] = useState\(false\);)",
    r"\1\n" + state_vars,
    content
)

# 3. Update initAudioVisualizer to use Reverb
old_init = """      // Conectar source -> f0 -> f1 -> ... -> f9 -> analyser -> destination
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i+1]);
      }
      filters[filters.length - 1].connect(analyser);
      analyser.connect(audioCtx.destination);"""

new_init = """      // Conectar source -> EQ -> (Split para Dry e Wet(Reverb)) -> destination
      const dryNode = audioCtx.createGain();
      const wetNode = audioCtx.createGain();
      const convolver = audioCtx.createConvolver();
      
      convolver.buffer = createReverbIR(audioCtx, 3.5, 2.5);
      
      dryGainRef.current = dryNode;
      wetGainRef.current = wetNode;
      reverbNodeRef.current = convolver;
      
      dryNode.gain.value = 1.0 - reverbMix;
      wetNode.gain.value = reverbMix;
      
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i+1]);
      }
      
      filters[filters.length - 1].connect(dryNode);
      filters[filters.length - 1].connect(convolver);
      convolver.connect(wetNode);
      
      dryNode.connect(analyser);
      wetNode.connect(analyser);
      analyser.connect(audioCtx.destination);"""
content = content.replace(old_init, new_init)


# 4. Add useEffects for FX
use_effects = """
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.preservesPitch = preservesPitch;
      audioRef.current.mozPreservesPitch = preservesPitch;
      audioRef.current.webkitPreservesPitch = preservesPitch;
    }
  }, [playbackRate, preservesPitch, currentSong]);

  useEffect(() => {
    if (dryGainRef.current && wetGainRef.current && audioContextRef.current) {
      dryGainRef.current.gain.setTargetAtTime(1.0 - reverbMix, audioContextRef.current.currentTime, 0.1);
      wetGainRef.current.gain.setTargetAtTime(reverbMix, audioContextRef.current.currentTime, 0.1);
    }
  }, [reverbMix]);
"""
content = re.sub(
    r"(const initAudioVisualizer = \(\) => {)",
    use_effects + r"\n  \1",
    content
)

# 5. Pass props to EqualizerModal
old_modal = """<EqualizerModal 
          isOpen={showEqModal} 
          onClose={() => setShowEqModal(false)}
          eqGains={eqGains}
          setEqGains={setEqGains}
          eqPreset={eqPreset}
          setEqPreset={setEqPreset}
          handleGainChange={handleGainChange}
        />"""

new_modal = """<EqualizerModal 
          isOpen={showEqModal} 
          onClose={() => setShowEqModal(false)}
          eqGains={eqGains}
          setEqGains={setEqGains}
          eqPreset={eqPreset}
          setEqPreset={setEqPreset}
          handleGainChange={handleGainChange}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          preservesPitch={preservesPitch}
          setPreservesPitch={setPreservesPitch}
          reverbMix={reverbMix}
          setReverbMix={setReverbMix}
        />"""
content = content.replace(old_modal, new_modal)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("PlayerBar.jsx patcheado com efeitos!")
