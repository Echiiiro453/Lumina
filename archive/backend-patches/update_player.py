import os
import re

file_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Sleep Timer Icon to lucide-react import
content = content.replace(
    "VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers, SlidersHorizontal }",
    "VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers, SlidersHorizontal, Moon }"
)

# 2. Add states for Sleep Timer and crossfadeRef
states_str = """  const [isLooping, setIsLooping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEqModal, setShowEqModal] = useState(false);
  
  // Lumina Extra Features
  const [sleepTimer, setSleepTimer] = useState(null);
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const crossfadeGainRef = useRef(null);"""

content = content.replace("  const [isLooping, setIsLooping] = useState(false);\n  const [showInfo, setShowInfo] = useState(false);\n  const [showEqModal, setShowEqModal] = useState(false);", states_str)

# 3. Add Sleep Timer useEffect
sleep_effect = """
  // Sleep Timer Countdown
  useEffect(() => {
    if (sleepTimer === null) return;
    const interval = setInterval(() => {
      setSleepTimeLeft(prev => {
        if (prev <= 1) {
          togglePlay(false);
          setSleepTimer(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sleepTimer]);

  const handleSetSleepTimer = (minutes) => {
    if (minutes === 0) {
      setSleepTimer(null);
      setSleepTimeLeft(null);
    } else {
      setSleepTimer(minutes);
      setSleepTimeLeft(minutes * 60);
    }
    setShowSleepMenu(false);
  };
"""

content = content.replace("  // Sync state to backend for MiniPlayer", sleep_effect + "\n  // Sync state to backend for MiniPlayer")

# 4. Patch initAudioVisualizer to add Crossfade Gain
init_audio_old = """        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i+1]);
        }
        filters[filters.length - 1].connect(analyser);
        analyser.connect(audioCtx.destination);"""

init_audio_new = """        for (let i = 0; i < filters.length - 1; i++) {
          filters[i].connect(filters[i+1]);
        }
        
        // Crossfade Gain
        const crossfadeGain = audioCtx.createGain();
        crossfadeGainRef.current = crossfadeGain;
        
        filters[filters.length - 1].connect(crossfadeGain);
        crossfadeGain.connect(analyser);
        analyser.connect(audioCtx.destination);"""

content = content.replace(init_audio_old, init_audio_new)

# 5. Patch handleTimeUpdate for crossfade
time_update_old = """  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setProgress(audioRef.current.currentTime);
    }
  };"""

time_update_new = """  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const cur = audioRef.current.currentTime;
      const dur = audioRef.current.duration || 0;
      setProgress(cur);
      
      // Lumina Crossfade Logic (5 segundos)
      if (crossfadeGainRef.current && dur > 10) {
        if (dur - cur <= 5) {
           // Fade out no final
           crossfadeGainRef.current.gain.value = Math.max(0, (dur - cur) / 5);
        } else if (cur <= 5) {
           // Fade in no início
           crossfadeGainRef.current.gain.value = Math.min(1, cur / 5);
        } else {
           crossfadeGainRef.current.gain.value = 1;
        }
      }
    }
  };"""

content = content.replace(time_update_old, time_update_new)

# 6. Add UI for Sleep Timer
sleep_ui = """
                <div className="relative">
                  <RippleButton 
                    onClick={() => setShowSleepMenu(!showSleepMenu)} 
                    className={`transition-colors ${sleepTimer ? 'text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'}`}
                    title={sleepTimer ? `Sleep Timer: ${Math.floor(sleepTimeLeft / 60)}:${(sleepTimeLeft % 60).toString().padStart(2, '0')}` : "Sleep Timer"}
                  >
                    <Moon size={24} />
                    {sleepTimer && (
                      <span className="absolute -bottom-2 -right-1 text-[9px] font-bold bg-surface-container px-1 rounded-full">
                        {Math.floor(sleepTimeLeft / 60)}m
                      </span>
                    )}
                  </RippleButton>
                  
                  <AnimatePresence>
                    {showSleepMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-40 bg-surface-container-high border border-outline-variant/30 rounded-2xl shadow-xl overflow-hidden z-50 flex flex-col"
                      >
                        <div className="p-3 border-b border-outline-variant/30 text-center">
                          <span className="text-xs font-bold text-on-surface uppercase tracking-widest">Sleep Timer</span>
                        </div>
                        {[15, 30, 45, 60].map(mins => (
                          <button key={mins} onClick={() => handleSetSleepTimer(mins)} className="py-3 px-4 text-sm text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors text-left border-b border-outline-variant/10">
                            Em {mins} minutos
                          </button>
                        ))}
                        <button onClick={() => handleSetSleepTimer(0)} className="py-3 px-4 text-sm text-error font-medium hover:bg-error/10 transition-colors text-left">
                          Desativar
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                
                <RippleButton 
"""

content = content.replace('                <RippleButton \n                  onClick={() => setShowInfo(true)}', sleep_ui)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated PlayerBar.jsx successfully")
