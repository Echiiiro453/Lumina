import os
import re

file_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Imports
content = content.replace(
    "import { Music, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers } from 'lucide-react';",
    "import { Music, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers, SlidersHorizontal } from 'lucide-react';"
)

content = content.replace(
    "import { RippleButton } from './Ripple';",
    "import { RippleButton } from './Ripple';\nimport { EqualizerModal, EQ_PRESETS, EQ_BANDS } from './EqualizerModal';"
)

# 2. States
states_injection = """
  const [showEqModal, setShowEqModal] = useState(false);
  const [eqPreset, setEqPreset] = useState(() => localStorage.getItem('appmusica_eq_preset') || 'Normal');
  const [eqGains, setEqGains] = useState(() => {
    try {
      const saved = localStorage.getItem('appmusica_eq_bands');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return EQ_PRESETS['Normal'] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  });
  const eqFiltersRef = useRef([]);

  useEffect(() => {
    localStorage.setItem('appmusica_eq_preset', eqPreset);
    localStorage.setItem('appmusica_eq_bands', JSON.stringify(eqGains));
    
    // Apply to Web Audio API filters
    if (eqFiltersRef.current.length === 10) {
      eqGains.forEach((gain, i) => {
        if (eqFiltersRef.current[i]) {
          eqFiltersRef.current[i].gain.setTargetAtTime(gain, audioContextRef.current.currentTime, 0.1);
        }
      });
    }
  }, [eqGains, eqPreset]);
"""

content = content.replace(
    "const [hasVideoTrack, setHasVideoTrack] = useState(false);",
    "const [hasVideoTrack, setHasVideoTrack] = useState(false);" + states_injection
)


# 3. Audio Context
new_init_audio = """
  // Initialize visualizer upon user play interaction
  const initAudioVisualizer = () => {
    if (!audioRef.current || audioContextRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      const source = audioCtx.createMediaElementSource(audioRef.current);
      
      // Criar 10 bandas do equalizador
      const filters = [];
      for (let i = 0; i < EQ_BANDS.length; i++) {
        const filter = audioCtx.createBiquadFilter();
        if (i === 0) filter.type = 'lowshelf';
        else if (i === EQ_BANDS.length - 1) filter.type = 'highshelf';
        else filter.type = 'peaking';
        
        filter.frequency.value = EQ_BANDS[i];
        filter.Q.value = 1.0;
        filter.gain.value = eqGains[i];
        filters.push(filter);
      }
      eqFiltersRef.current = filters;

      // Conectar source -> f0 -> f1 -> ... -> f9 -> analyser -> destination
      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i+1]);
      }
      filters[filters.length - 1].connect(analyser);
      analyser.connect(audioCtx.destination);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      
      drawVisualizer();
    } catch (e) {
      console.error("Erro ao inicializar visualizador/equalizador:", e);
    }
  };
"""

# replace initAudioVisualizer block
content = re.sub(
    r"// Initialize visualizer upon user play interaction.*?drawVisualizer\(\);\s*\}\s*catch[^{]*\{[^}]*\}\s*};", 
    new_init_audio.strip(), 
    content, 
    flags=re.DOTALL
)

# 4. Add UI Buttons
button_str = """
                <RippleButton 
                  onClick={() => setShowEqModal(true)} 
                  className="text-on-surface-variant/50 hover:text-on-surface transition-colors" 
                  title="Equalizador"
                >
                  <SlidersHorizontal size={24} />
                </RippleButton>
"""
content = content.replace(
    "<Info size={24} />\n                </RippleButton>",
    "<Info size={24} />\n                </RippleButton>\n" + button_str
)

button_str_mini = """
                  <button onClick={() => setShowEqModal(true)} className="text-on-surface-variant hover:text-on-surface p-1">
                    <SlidersHorizontal size={18} />
                  </button>
"""

content = content.replace(
    "<Info size={18} />\n                  </button>",
    "<Info size={18} />\n                  </button>\n" + button_str_mini
)

# 5. Add Modal render
modal_str = """
      <EqualizerModal 
        isOpen={showEqModal} 
        onClose={() => setShowEqModal(false)}
        gains={eqGains}
        setGains={setEqGains}
        preset={eqPreset}
        setPreset={setEqPreset}
      />
"""

content = content.replace(
    "      {/* Overlay Background when expanded */}",
    modal_str + "\n      {/* Overlay Background when expanded */}"
)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Updated successfully")
