import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { Music, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers, SlidersHorizontal, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RippleButton } from './Ripple';
import { EqualizerModal, EQ_PRESETS, EQ_BANDS } from './EqualizerModal';


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

  const [isPlaying, setIsPlaying] = useState(false);

  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [preservesPitch, setPreservesPitch] = useState(true);
  const [reverbMix, setReverbMix] = useState(0.0);
  const reverbNodeRef = useRef(null);
  const dryGainRef = useRef(null);
  const wetGainRef = useRef(null);

  

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [metadata, setMetadata] = useState(null);
  const [isLooping, setIsLooping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showEqModal, setShowEqModal] = useState(false);
  // Lumina Extra Features
  const [sleepTimer, setSleepTimer] = useState(null);
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const crossfadeGainRef = useRef(null);


  // --- Voice Commands Listener ---
  useEffect(() => {
    const handleVoice = (e) => {
      const action = e.detail;
      console.log('Voice action received:', action);
      if (action === 'pause') {
        if (isPlaying) togglePlay();
      } else if (action === 'play') {
        if (!isPlaying) togglePlay();
      } else if (action === 'next' && onNext) {
        onNext();
      } else if (action === 'prev' && onPrev) {
        onPrev();
      }
    };
    window.addEventListener('voiceCommand', handleVoice);
    return () => window.removeEventListener('voiceCommand', handleVoice);
  }, [isPlaying, onNext, onPrev]);

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

  // Sync state to backend for MiniPlayer
  useEffect(() => {
    if (!currentSong) return;
    
    let cover = '';
    if (metadata?.coverUrl) cover = metadata.coverUrl;
    else if (currentSong.video_id) cover = `https://i.ytimg.com/vi/${currentSong.video_id}/0.jpg`;
    else if (currentSong.thumbnails && currentSong.thumbnails.length > 0) cover = currentSong.thumbnails[0].url;

    fetch('http://localhost:8000/api/miniplayer/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: currentSong.title || 'Música',
        artist: currentSong.artist || currentSong.author || (t('playerUnknown') || 'Desconhecido'),
        cover_url: cover,
        isPlaying,
        progress,
        duration
      })
    }).catch(() => {});
  }, [currentSong, isPlaying, progress, duration, metadata]);

  // Poll commands from MiniPlayer
  useEffect(() => {
    const interval = setInterval(() => {
      fetch('http://localhost:8000/api/miniplayer/command')
        .then(res => res.json())
        .then(data => {
          if (data.command === 'play') togglePlay(true);
          else if (data.command === 'pause') togglePlay(false);
          else if (data.command === 'next' && onNext) onNext();
          else if (data.command === 'prev' && onPrev) onPrev();
        })
        .catch(() => {});
    }, 500);
    return () => clearInterval(interval);
  }, [onNext, onPrev]);

  const openMiniPlayer = () => {
    fetch('http://localhost:8000/api/miniplayer/open', { method: 'POST' }).catch(console.error);
  };
  
  const audioRef = useRef(null);
  const scrobbledRef = useRef(false);
  
  const [artistPhoto, setArtistPhoto] = useState(null);
  const [showVisualizer, setShowVisualizer] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  const [hasVideoTrack, setHasVideoTrack] = useState(false);
  const [eqPreset, setEqPreset] = useState(() => localStorage.getItem('appmusica_eq_preset') || 'Normal');
  const [eqGains, setEqGains] = useState(() => {
    try {
      const saved = localStorage.getItem('appmusica_eq_bands');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return EQ_PRESETS['Normal'] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  });
  const eqFiltersRef = useRef([]);
  const handleGainChange = (bandIndex, value) => {
    setEqGains(prev => {
      const newGains = [...prev];
      newGains[bandIndex] = value;
      return newGains;
    });
    setEqPreset('Personalizado');
  };

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


  // Initialize visualizer upon user play interaction
  
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

      // Conectar source -> EQ -> (Split para Dry e Wet(Reverb)) -> destination
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
      analyser.connect(audioCtx.destination);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      
      drawVisualizer();
    } catch (e) {
      console.error("Erro ao inicializar visualizador/equalizador:", e);
    }
  };

  const drawVisualizer = () => {
    if (!analyserRef.current || !canvasRef.current) {
      animationRef.current = requestAnimationFrame(drawVisualizer);
      return;
    }
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      ctx.clearRect(0, 0, width, height);
      
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];
        
        // Cor baseada no tema M3 (Primary)
        const rootStyles = getComputedStyle(document.documentElement);
        const primaryColor = rootStyles.getPropertyValue('--md-sys-color-primary').trim() || '#3b82f6';
        
        ctx.fillStyle = primaryColor;
        ctx.globalAlpha = barHeight / 255;
        ctx.fillRect(x, height - (barHeight / 2), barWidth, barHeight / 2);
        
        x += barWidth + 1;
      }
    };
    draw();
  };

  // Cleanup visualizer
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentSong) return;

    // Reset state for new song
    setMetadata(null);
    setHasVideoTrack(false);

    const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;

    if (currentSong.isStream && currentSong.url) {
      // ── Streaming mode: use the resolved audio URL directly ──
      if (audioRef.current) {
        audioRef.current.src = currentSong.url;
        audioRef.current.volume = volume;
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => console.error('Stream playback error:', err));
      }
      // Set basic metadata from song object
      setMetadata({
        title: currentSong.title,
        artist: currentSong.artist || '',
        coverUrl: currentSong.thumbnail || '',
      });
    } else if (currentSong.file) {
      const urlPath = currentSong.file.split(/[\\\/]/).map(encodeURIComponent).join('/');
      const url = `${baseUrl}/downloads/${urlPath}`;
      
      // Fetch embedded lyrics & cover from backend
      scrobbledRef.current = false;
      fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)
        .then(res => res.json())
        .then(data => {
            if (data.cover_b64) {
               data.coverUrl = `data:${data.mime_type};base64,${data.cover_b64}`;
            }
            setMetadata(data);
            
            // Fetch Artist Photo via Deezer if artist exists
            if (data.artist) {
                fetch(`${baseUrl}/api/artist_info?artist=${encodeURIComponent(data.artist)}`)
                  .then(r => r.json())
                  .then(artistData => {
                      if (artistData.status === 'success' && artistData.picture) {
                          setArtistPhoto(artistData.picture);
                      } else {
                          setArtistPhoto(null);
                      }
                  }).catch(() => setArtistPhoto(null));
            } else {
                setArtistPhoto(null);
            }
        })
        .catch(err => console.error("Error fetching metadata", err));

      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.volume = volume;
        audioRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(err => {
            console.error("Playback error:", err);
          });
      }
    }
  }, [currentSong]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    initAudioVisualizer();
    if (isPlaying) audioRef.current.pause();
    else audioRef.current.play();
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const curr = audioRef.current.currentTime;
      const dur = audioRef.current.duration;
      setProgress(curr);
      setDuration(dur || 0);

      // Scrobble when 50% played
      if (!scrobbledRef.current && dur > 30 && curr >= dur * 0.5) {
        scrobbledRef.current = true;
        try {
          const fallbackArtist = currentSong.title?.includes(' - ') ? currentSong.title.split(' - ')[0].trim() : 'Unknown Artist';
          const fallbackTitle = currentSong.title?.includes(' - ') ? currentSong.title.split(' - ')[1].trim() : currentSong.title;
          
          const artist = metadata?.artist || currentSong.artist || fallbackArtist;
          const title = metadata?.title || fallbackTitle;
          if (artist && title) {
            fetch(`${window.location.protocol}//${window.location.hostname}:8000/api/scrobble`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ artist, title })
            }).catch(()=>{});
          }
        } catch(e) {}
      }


      if (curr >= dur && dur > 0) {
        if (isLooping) {
          audioRef.current.currentTime = 0;
          audioRef.current.play();
        } else {
          setIsPlaying(false);
          if (onFinish) onFinish();
        }
      }
    }
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  };

  const handleVolume = (e) => {
    const vol = Number(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol;
      setIsMuted(vol === 0);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setVolume(1);
      if (audioRef.current) audioRef.current.volume = 1;
      setIsMuted(false);
    } else {
      setVolume(0);
      if (audioRef.current) audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  const formatTime = (t) => {
    if (!t) return "0:00";
    const min = Math.floor(t / 60);
    const sec = Math.floor(t % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const coverSrc = metadata?.coverUrl || currentSong?.thumbnail || "https://github.com/shadcn.png";


  const parsedLyrics = React.useMemo(() => {
    if (!metadata?.lyrics) return [];
    const lines = metadata.lyrics.split('\n');
    const parsed = [];
    const timeRegex = /^\[(\d{2}):(\d{2}(?:\.\d{2,3})?)\](.*)/;
    
    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const text = match[3].trim();
        if (text) {
          parsed.push({ time: minutes * 60 + seconds, text });
        }
      } else if (line.trim() && !line.startsWith('[')) {
        parsed.push({ time: -1, text: line.trim() });
      }
    }
    return parsed;
  }, [metadata?.lyrics]);

  const activeLineIndex = React.useMemo(() => {
    if (parsedLyrics.length === 0 || parsedLyrics[0].time === -1) return -1;
    let idx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (progress >= parsedLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [progress, parsedLyrics]);

  const lyricsContainerRef = useRef(null);

  if (!currentSong) return null;

  useEffect(() => {
    if (activeLineIndex !== -1 && lyricsContainerRef.current && isExpanded) {
      const container = lyricsContainerRef.current;
      const activeElement = container.children[activeLineIndex];
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLineIndex, isExpanded]);

  const openExternal = async () => {
    if (!currentSong?.file) return;
    try {
      await fetch(`${window.location.protocol}//${window.location.hostname}:8000/api/open_external`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: currentSong.file })
      });
    } catch (e) {
      console.error("Failed to open external player", e);
    }
  };

  return (
    <>
      <style>
        {`
        @keyframes wave-move {
          0% { background-position: 0 center; }
          100% { background-position: -24px center; }
        }
        .wave-bg {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='12'%3E%3Cpath d='M0,6 Q6,0 12,6 T24,6' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: repeat-x;
          background-position: 0 center;
          animation: wave-move 0.8s linear infinite;
          background-size: 24px 12px;
        }
        `}
      </style>

      {/* Info Modal */}
      <AnimatePresence>
        {showInfo && metadata && (
          <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-surface-container/80 backdrop-blur-2xl rounded-[2rem] border border-outline-variant/30 shadow-2xl p-6 flex flex-col"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-medium text-on-surface tracking-tight">Detalhes da Faixa</h3>
                <button onClick={() => setShowInfo(false)} className="p-2 text-on-surface-variant hover:text-on-surface bg-surface-container-high hover:bg-surface-container-highest rounded-full transition-colors"><X size={20}/></button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar text-sm text-on-surface-variant pr-2 max-h-[60vh]">
                <div className="p-4 bg-surface-container-high rounded-2xl">
                  <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Título</span>
                  <span className="text-on-surface font-medium">{metadata.title || currentSong.title}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Artista</span>
                    {onOpenArtist && metadata?.artist ? (
                      <button
                        onClick={() => onOpenArtist(metadata.artist)}
                        className="text-on-surface font-medium truncate block hover:text-primary transition-colors text-left w-full"
                        title={`Ver discografia de ${metadata.artist}`}
                      >
                        {metadata.artist} ↗
                      </button>
                    ) : (
                      <span className="text-on-surface font-medium truncate block" title={metadata.artist || 'Desconhecido'}>{metadata.artist || 'Desconhecido'}</span>
                    )}
                  </div>
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Álbum</span>
                    <span className="text-on-surface font-medium truncate block" title={metadata.album || "Desconhecido"}>{metadata.album || "Desconhecido"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">{t('duration') || 'Duração'}</span>
                    <span className="text-on-surface font-mono">{formatTime(duration)}</span>
                  </div>
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Ano</span>
                    <span className="text-on-surface">{metadata.year || "N/A"}</span>
                  </div>
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Gênero</span>
                    <span className="text-on-surface truncate block">{metadata.genre || "N/A"}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">{t('quality') || 'Qualidade'}</span>
                    <span className="text-on-surface tracking-widest font-mono text-xs">{currentSong.quality || "Local"}</span>
                  </div>
                  <div className="p-4 bg-surface-container-high rounded-2xl">
                    <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Tamanho</span>
                    <span className="text-on-surface font-mono text-xs">
                      {metadata.file_size ? `${(metadata.file_size / 1024 / 1024).toFixed(2)} MB` : "N/A"}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-surface-container-high rounded-2xl mt-2">
                  <span className="block text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest mb-1">Caminho do Arquivo</span>
                  <span className="text-xs break-all text-on-surface-variant font-mono">{currentSong.file}</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Persistent Media Element */}
      <video 
        ref={audioRef}
        crossOrigin="anonymous"
        onPlay={initAudioVisualizer}
        onLoadedMetadata={(e) => setHasVideoTrack(e.target.videoWidth > 0)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onClick={togglePlay}
        className={
          isExpanded && hasVideoTrack 
            ? "fixed inset-0 m-auto z-[205] w-full max-w-5xl max-h-[50vh] rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] bg-black object-contain cursor-pointer" 
            : "hidden"
        }
      />

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed inset-0 z-[200] flex flex-col bg-surface-container"
          >
              {/* Blurred Background */}
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-70 blur-[80px] scale-125 saturate-150 transition-all duration-1000"
                style={{ backgroundImage: `url(${coverSrc})` }}
              />
              <div className="absolute inset-0 bg-black/60" />
              
              {/* Header */}
              <div className="relative z-10 flex items-center justify-between p-6">
                <button onClick={() => setIsExpanded(false)} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 rounded-full transition-colors">
                  <Minimize2 size={24} />
                </button>
                <h2 className="text-sm font-bold tracking-widest uppercase text-on-surface-variant/50">Reproduzindo Agora</h2>
                <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-error hover:bg-on-surface/10 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

            {/* Main Content Area */}
            <div className="relative z-10 flex-1 flex flex-col md:flex-row items-center justify-center p-6 gap-12 overflow-hidden">
              {!hasVideoTrack && (
                <>
                  {/* Visualizer & Cover Art */}
                  <div className="flex flex-col items-center gap-4 md:gap-6 min-h-0">
                    <div className={`w-48 h-48 md:w-[min(24rem,45vh)] md:h-[min(24rem,45vh)] flex-shrink-0 relative group rounded-full shadow-[0_30px_60px_rgba(0,0,0,0.6)] ${isPlaying && !hasVideoTrack ? 'animate-[spin_20s_linear_infinite]' : ''}`}>
                      <img 
                        src={coverSrc} 
                        className="w-full h-full object-cover rounded-full"
                        alt="Cover"
                      />
                      <div className="absolute inset-0 rounded-full border-[15px] border-black/10 pointer-events-none" />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 md:w-6 md:h-6 bg-black rounded-full shadow-inner z-10" />
                    </div>
                    
                    <div className="w-full h-12 md:h-[min(6rem,10vh)] shrink-0 relative opacity-80 mix-blend-screen">
                      <canvas ref={canvasRef} className="w-full h-full" width={300} height={100} />
                    </div>
                  </div>

                  {/* Lyrics Area - Minimalist */}
                  <div 
                    className="flex-1 w-full max-w-lg h-full min-h-[200px] flex flex-col relative"
                    style={{ 
                      maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)', 
                      WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' 
                    }}
                  >
                    <div ref={lyricsContainerRef} className="flex-1 overflow-y-auto space-y-4 md:space-y-6 pr-4 custom-scrollbar text-center md:text-left relative z-0 pb-[30vh] pt-[15vh]">
                      {parsedLyrics.length > 0 ? (
                        parsedLyrics.map((line, i) => {
                          const isActive = i === activeLineIndex;
                          const isPlain = line.time === -1;
                          
                          let className = "transition-all duration-500 text-base md:text-xl font-medium leading-relaxed text-on-surface-variant hover:text-on-surface hover:scale-[1.02] origin-left";
                          if (!isPlain && isActive) {
                            className = "transition-all duration-500 text-xl md:text-3xl font-bold leading-relaxed text-on-surface scale-[1.05] origin-left drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]";
                          } else if (!isPlain && activeLineIndex !== -1 && i < activeLineIndex) {
                            className = "transition-all duration-500 text-base md:text-lg font-medium leading-relaxed text-on-surface-variant/50";
                          }

                          return (
                            <p key={i} className={className}>
                              {line.text}
                            </p>
                          );
                        })
                      ) : (
                        <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/50 space-y-4">
                          <motion.div animate={isPlaying ? { scale: [1, 1.1, 1] } : {}} transition={{ repeat: Infinity, duration: 2 }}>
                            <Music size={64} className="opacity-30 drop-shadow-2xl" />
                          </motion.div>
                          <p className="text-sm uppercase tracking-widest font-medium">Faixa Instrumental</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Controls Container */}
            <div className="relative z-10 p-6 md:p-10 flex flex-col items-center w-full max-w-4xl mx-auto space-y-8">
              <div className="text-center relative w-full flex flex-col justify-center items-center gap-4">
                {artistPhoto && (
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)] border-2 border-surface-container-highest animate-in fade-in zoom-in duration-500">
                    <img src={artistPhoto} alt="Artist" className="w-full h-full object-cover" />
                  </div>
                )}
                <div>
                  <h1 className="text-3xl md:text-4xl font-medium text-on-surface mb-2 tracking-tight">{currentSong.title}</h1>
                  {onOpenArtist && (metadata?.artist || currentSong.artist) ? (
                    <button
                      onClick={() => onOpenArtist(metadata?.artist || currentSong.artist)}
                      className="text-on-surface-variant/50 font-light text-sm tracking-widest uppercase hover:text-primary transition-colors group flex items-center gap-2 mx-auto"
                      title={`Ver discografia de ${metadata?.artist || currentSong.artist}`}
                    >
                      {metadata?.artist || currentSong.quality || 'Local Audio'}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold normal-case tracking-normal">ver mais</span>
                    </button>
                  ) : (
                    <p className="text-on-surface-variant/50 font-light text-sm tracking-widest uppercase">{metadata?.artist || currentSong.quality || 'Local Audio'}</p>
                  )}
                </div>
                
                {hasVideoTrack && (
                  <button 
                    onClick={openExternal}
                    className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-4 py-2 bg-on-surface/10 hover:bg-on-surface/20 text-on-surface rounded-lg transition-colors text-sm border border-outline-variant/30 backdrop-blur-md"
                    title="Abrir no VLC / Player do Sistema"
                  >
                    <ExternalLink size={16} />
                    <span className="hidden md:inline">Player Externo</span>
                  </button>
                )}
              </div>

              {/* Progress Bar */}
              <div className="w-full flex items-center gap-4 text-xs md:text-sm text-on-surface-variant font-mono">
                <span>{formatTime(progress)}</span>
                <div className="relative flex-1 h-3 hover:h-4 transition-all duration-300 bg-surface-container-highest rounded-full group cursor-pointer flex items-center overflow-hidden">
                  <div 
                    className={`absolute left-0 h-full bg-on-surface rounded-full transition-colors ${isPlaying ? 'wave-bg' : ''}`}
                    style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={progress}
                    onChange={handleSeek}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <span>{formatTime(duration)}</span>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-6 md:gap-10">
                <RippleButton 
                  onClick={() => setIsShuffle(!isShuffle)} 
                  className={`transition-colors ${isShuffle ? 'text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'} rounded-full p-2`} 
                  title="Aleatório"
                >
                  <Shuffle size={24} />
                </RippleButton>
                <RippleButton 
                  onClick={() => setIsLooping(!isLooping)} 
                  className={`transition-colors ${isLooping ? 'text-primary' : 'text-on-surface-variant/50 hover:text-on-surface'} rounded-full p-2`} 
                  title="Repetir Faixa"
                >
                  <Repeat size={24} />
                </RippleButton>
                <RippleButton onClick={onPrev} className="text-on-surface-variant hover:text-on-surface transition-colors rounded-full p-2" title="Anterior">
                  <SkipBack size={32} />
                </RippleButton>
                <RippleButton
                  onClick={togglePlay}
                  className="w-16 h-16 md:w-24 md:h-24 bg-primary text-on-primary rounded-[2rem] flex items-center justify-center transition-all hover:scale-105 shadow-[0_10px_30px_rgba(0,0,0,0.3)]"
                >
                  {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
                </RippleButton>
                <RippleButton onClick={onNext} className="text-on-surface-variant hover:text-on-surface transition-colors rounded-full p-2" title="Próxima">
                  <SkipForward size={32} />
                </RippleButton>

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
                  onClick={() => setShowInfo(true)}
                  className="text-on-surface-variant/50 hover:text-on-surface transition-colors" 
                  title="Informações da Faixa"
                >
                  <Info size={24} />
                </RippleButton>

                <RippleButton 
                  onClick={() => setShowEqModal(true)} 
                  className="text-on-surface-variant/50 hover:text-on-surface transition-colors" 
                  title="Equalizador"
                >
                  <SlidersHorizontal size={24} />
                </RippleButton>

              </div>
              
              {/* Volume */}
              <div className="absolute bottom-10 right-10 flex items-center gap-3">
                <button onClick={toggleMute} className="text-on-surface-variant hover:text-on-surface">
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <div className="relative w-24 h-1.5 bg-surface-container-highest rounded-full group cursor-pointer flex items-center">
                  <div 
                    className="absolute left-0 h-full bg-on-surface rounded-full group-hover:bg-primary transition-colors"
                    style={{ width: `${volume * 100}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={handleVolume}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="minimized"
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-4 left-4 right-4 z-[150] bg-surface-container-high border border-outline-variant shadow-2xl cursor-pointer hover:bg-surface-variant transition-colors rounded-[2rem] p-3 px-5"
            onClick={() => setIsExpanded(true)}
          >
            <div className="max-w-7xl mx-auto flex items-center gap-4 md:gap-8 relative" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-4 w-1/4 min-w-[200px] cursor-pointer" onClick={() => setIsExpanded(true)}>
                <div className="w-12 h-12 rounded-lg overflow-hidden relative group">
                  <img src={coverSrc} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Maximize2 size={20} className="text-white" />
                  </div>
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-on-surface font-medium text-sm truncate tracking-tight">{currentSong.title}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-on-surface-variant border border-outline-variant/30 px-1.5 py-0.5 rounded-md uppercase font-medium tracking-widest">
                      {currentSong.quality || "Local Audio"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center gap-1">
                <div className="flex items-center gap-6">
                  <RippleButton onClick={(e) => { e.stopPropagation(); setIsShuffle(!isShuffle); }} className={`transition-colors ${isShuffle ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`} title="Aleatório">
                    <Shuffle size={18} />
                  </RippleButton>
                  <RippleButton onClick={(e) => { e.stopPropagation(); if(onPrev) onPrev(); }} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Anterior">
                    <SkipBack size={20} />
                  </RippleButton>
                  <RippleButton
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    className="w-12 h-12 bg-primary text-on-primary rounded-2xl flex items-center justify-center hover:scale-105 transition-transform shadow-md"
                  >
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                  </RippleButton>
                  <RippleButton onClick={(e) => { e.stopPropagation(); if(onNext) onNext(); }} className="text-on-surface-variant hover:text-on-surface transition-colors" title="Próxima">
                    <SkipForward size={20} />
                  </RippleButton>
                </div>

                <div className="w-full flex items-center gap-3 text-xs text-on-surface-variant font-mono">
                  <span>{formatTime(progress)}</span>
                  <div className="relative flex-1 h-3 hover:h-4 transition-all duration-300 bg-surface-container-highest rounded-full group cursor-pointer flex items-center overflow-hidden">
                    <div 
                      className={`absolute left-0 h-full bg-on-surface rounded-full transition-colors ${isPlaying ? 'wave-bg' : ''}`}
                      style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      value={progress}
                      onChange={handleSeek}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="w-1/4 flex items-center justify-end gap-3 md:gap-6">
                <button onClick={openMiniPlayer} className="text-on-surface-variant hover:text-on-surface transition-colors mr-2" title="Mini Player Flutuante (Always on top)">
                   <Layers size={18} />
                </button>
                <button onClick={() => setIsExpanded(true)} className="text-on-surface-variant hover:text-on-surface transition-colors mr-2">
                   <Maximize2 size={18} />
                </button>
                <div className="flex items-center gap-2 group">
                  <button onClick={toggleMute} className="text-on-surface-variant group-hover:text-on-surface">
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <div className="relative w-20 h-1.5 bg-surface-container-highest rounded-full group cursor-pointer flex items-center">
                    <div 
                      className="absolute left-0 h-full bg-on-surface transition-colors rounded-full"
                      style={{ width: `${volume * 100}%` }}
                    />
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={handleVolume}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                </div>
                <div className="h-8 w-px bg-outline-variant/30 mx-2"></div>
                <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {showEqModal && (
        <EqualizerModal
          isOpen={showEqModal}
          onClose={() => setShowEqModal(false)}
          preset={eqPreset}
          setPreset={setEqPreset}
          gains={eqGains}
          setGains={setEqGains}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
          preservesPitch={preservesPitch}
          setPreservesPitch={setPreservesPitch}
          reverbMix={reverbMix}
          setReverbMix={setReverbMix}
        />
      )}
    </>
  );
}
