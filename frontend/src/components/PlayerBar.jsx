import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { Music, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, X, Maximize2, Minimize2, ExternalLink, Repeat, Shuffle, Info, Activity, Layers, SlidersHorizontal, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { RippleButton } from './Ripple';
import { EqualizerModal } from './EqualizerModal';
import { EQ_PRESETS, EQ_BANDS } from './equalizerConstants';
import { AudioDiagnosticsPanel } from './AudioDiagnosticsPanel';
import { getAutoCalibrationProfile, SEEK_TEMP_HEADROOM_DB } from '../audio/presets/autoCalibrationProfiles';
import { logToCMD } from './playerConstants';


// --- AUXILIAR DE TELEMETRIA (Logs diretos no CMD) ---
// Throttled per-source to avoid flooding the backend/browser with HTTP requests.


// ---------------------------------------------------

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

const measureIRRms = (buffer) => {
  const data = buffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i];
  }
  return Math.sqrt(sum / data.length);
};

const loadIR = async (audioCtx, preset) => {
  const fileMap = {
     'Pequena': 'room_small.wav',
     'Concerto': 'concert_hall.wav',
     'Estádio': 'stadium.wav',
     'Vastidão': 'vast_space.wav',
     'Catedral': 'cathedral.wav',
     'Club': 'club.wav',
     'Geleira': 'geleira.wav',
     'Praia': 'praia.wav',
     'Tubo': 'tubo.wav',
     'Squash': 'squash.wav',
     'Túnel': 'tunel.wav',
     'Concreto': 'concreto.wav',
     'Tanque': 'tanque.wav',
     'Masmorra': 'masmorra.wav'
  };
  const filename = fileMap[preset];
  if (!filename) {
    const buf = createReverbIR(audioCtx, 3.5, 2.5);
    buf.rms = measureIRRms(buf);
    return buf;
  }
  
  let buffer;
  try {
    const response = await fetch(`/irs/${filename}`);
    if (!response.ok) throw new Error("IR file not found");
    const arrayBuffer = await response.arrayBuffer();
    buffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    let duration = 3.5, decay = 2.5;
    switch (preset) {
      case 'Pequena': duration = 0.8; decay = 5.0; break;
      case 'Catedral': duration = 5.0; decay = 1.2; break;
      case 'Club': duration = 1.2; decay = 4.0; break;
      case 'Concerto': duration = 2.5; decay = 3.0; break;
      case 'Estádio': duration = 3.5; decay = 2.0; break;
      case 'Vastidão': duration = 6.0; decay = 1.0; break;
      case 'Geleira': duration = 4.0; decay = 2.0; break;
      case 'Praia': duration = 1.0; decay = 4.0; break;
      case 'Tubo': duration = 3.0; decay = 3.5; break;
      case 'Squash': duration = 1.5; decay = 3.0; break;
      case 'Túnel': duration = 5.0; decay = 1.5; break;
      case 'Concreto': duration = 2.0; decay = 2.0; break;
      case 'Tanque': duration = 4.0; decay = 1.8; break;
      case 'Masmorra': duration = 3.5; decay = 2.2; break;
    }
    buffer = createReverbIR(audioCtx, duration, decay);
  }
  buffer.rms = measureIRRms(buffer);
  return buffer;
};


function analyzeTrackLoudness(audioBuffer) {
  const EPS = 1e-12;
  const channels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  let peak = 0;
  let sumSquares = 0;
  let count = 0;
  for (let ch = 0; ch < channels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const x = data[i];
      peak = Math.max(peak, Math.abs(x));
      if (Math.abs(x) > 0.0005) {
        sumSquares += x * x;
        count++;
      }
    }
  }
  const rms = Math.sqrt(sumSquares / Math.max(count, 1));
  const loudnessDb = 20 * Math.log10(Math.max(rms, EPS));
  const peakDb = 20 * Math.log10(Math.max(peak, EPS));
  return { loudnessDb, peakDb };
}

function calculateReplayGain({
  measuredLoudnessDb,
  peakDb,
  targetDb = -16.0,
  ceilingDb = -1.0,
  safetyMarginDb = 0.5
}) {
  const rawGainDb = targetDb - measuredLoudnessDb;
  const maxGainByPeakDb = ceilingDb - peakDb - safetyMarginDb;
  const safeGainDb = Math.min(rawGainDb, maxGainByPeakDb);
  return {
    rawGainDb,
    safeGainDb,
    peakLimited: safeGainDb < rawGainDb
  };
}




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

  // --- Advanced DSP States & Refs ---
  const [enableTransient, setEnableTransient] = useState(false);
  const [transientAttack, setTransientAttack] = useState(1.0);
  const [transientSustain, setTransientSustain] = useState(0.0);
  const transientRef = useRef(null);

  const [enableAdaptiveEq, setEnableAdaptiveEq] = useState(false);
  const adaptiveEqRef = useRef(null);

  const [enableDeesser, setEnableDeesser] = useState(false);
  const deesserRef = useRef(null);

  const [enableDeharsh, setEnableDeharsh] = useState(false);
  const deharshRef = useRef(null);

  const [enableSaturation, setEnableSaturation] = useState(false);
  const [satDrive, setSatDrive] = useState(0.20);
  const [satMix, setSatMix] = useState(0.25);
  const [saturationOutputTrimDb, setSaturationOutputTrimDb] = useState(0);
  const [satMode, setSatMode] = useState('tube');
  const saturationRef = useRef(null);

  const [enableSubmono, setEnableSubmono] = useState(false);
  const submonoRef = useRef(null);

  const [enableCrossfeed, setEnableCrossfeed] = useState(false);
  const [crossfeedAmount, setCrossfeedAmount] = useState(0.5);
  const crossfeedRef = useRef(null);

  const masteringRef = useRef(null);
  const lufsRef = useRef(null);
  const [, setLufsValue] = useState(null);

  // --- Missing / New DSP States & Refs ---
  const [enableReplayGain, setEnableReplayGain] = useState(true);
  const replayGainNodeRef = useRef(null);
  const masterGainRef = useRef(null);
  const wetHpfRef = useRef(null);
  const wetLpfRef = useRef(null);
  const wetMidEqRef = useRef(null);
  const wetHighEqRef = useRef(null);
  const currentIrRmsRef = useRef(0.15); // baseline safe rms

  // --- AutoEQ ---
  const [autoEqProfile, setAutoEqProfile] = useState(null);
  const [autoEqAmount, setAutoEqAmount] = useState(0.75);
  const autoEqPreampRef = useRef(null);
  const autoEqFiltersRef = useRef([]);

  // --- AB Comparator ---
  const [abMode, setAbMode] = useState('PROCESSED');
  const [abBlend, setAbBlend] = useState(1.0);
  const abComparatorRef = useRef(null);
  const abModeRef = useRef('PROCESSED');
  const abBlendRef = useRef(1.0);

  const [enable8D, setEnable8D] = useState(false);
  const [motionMode, setMotionMode] = useState('Elipse');
  const [motionSpeed, setMotionSpeed] = useState(0.5);
  const [motionRadius, setMotionRadius] = useState(2.0);
  const [stereoWidth, setStereoWidth] = useState('Natural');
  const [bassEnhancer, setBassEnhancer] = useState(false);
  const [bassIntensity, setBassIntensity] = useState(50);
  const [roomMorphing, setRoomMorphing] = useState(false);
  const [lufsMode, setLufsMode] = useState('Integrated');
  const [spatialMode, setSpatialMode] = useState('Concerto');
  const [roomMaterial, setRoomMaterial] = useState('Madeira');
  const [genreProfile, setGenreProfile] = useState('Rock');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [harmonicExciter, setHarmonicExciter] = useState('medium');
  const [autoCalibProfile, setAutoCalibProfile] = useState(null);
  const [presetIntensity, setPresetIntensity] = useState(() => {
    return parseFloat(localStorage.getItem('appmusica_preset_intensity') || '1.0');
  });
  const [presetHeadroomConfig, setPresetHeadroomConfig] = useState({
    extraHeadroomDb: 0,
    maxMakeupDb: 0,
    intensity: 1.0
  });

  const [enablePhaseRotation, setEnablePhaseRotation] = useState(false);
  const [enableSpectralGlue, setEnableSpectralGlue] = useState(false);
  const [spectralGlueThreshold, setSpectralGlueThreshold] = useState(-24.0);
  const spectralGlueRef = useRef(null);

  const [enableStereoDepth, setEnableStereoDepth] = useState(false);
  const [stereoDepthAmount, setStereoDepthAmount] = useState(0.45);
  const depthRef = useRef(null);

  const panner8DRef = useRef(null);
  const stereoWidthRef = useRef(null);
  const bassEnhancerGainRef = useRef(null);
  const bassShaperRef = useRef(null);
  const preGainRef = useRef(null);
  const currentHeadroomDbRef = useRef(-6.0);
  const seekGateRef = useRef(null);
  const seekTimeoutRef = useRef(null);
  
  const stereoScopeRef = useRef(null);
  const stereoTelemetryRef = useRef(null);
  const sourceQualityRef = useRef(null);
  const sourceQualityTelemetryRef = useRef(null);
  const multibandStereoTelemetryRef = useRef(null);
  const truePeakNodeRef = useRef(null);
  const limiterRef = useRef(null);
  const occlusionFilterRef = useRef(null);
  const exciterNodeRef = useRef(null);
  const masterTelemetryRef = useRef(null);
  const lastResumeStatusRef = useRef("PENDING");
  const lastPerformanceGovernorLogTimeRef = useRef(0);
  const lastPerformanceGovernorRiskRef = useRef("BAIXO");
  const governorOverrideRef = useRef({ transientBypassed: false, adaptiveEqBypassed: false });
  const governorActiveRef = useRef(false);
  const criticalStreakStartMsRef = useRef(0);
  const lowStreakStartMsRef = useRef(0);
  const lastGovernorChangeMsRef = useRef(0);
  const governorRiskRef = useRef("BAIXO");
  const enableTransientRef = useRef(false);
  const enableAdaptiveEqRef = useRef(false);

  useEffect(() => {
    enableTransientRef.current = enableTransient;
  }, [enableTransient]);

  useEffect(() => {
    enableAdaptiveEqRef.current = enableAdaptiveEq;
  }, [enableAdaptiveEq]);

  const isPlayingRef = useRef(false);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (truePeakNodeRef.current && truePeakNodeRef.current.port) {
      truePeakNodeRef.current.port.postMessage({
        type: "state",
        isPlaying: isPlaying
      });
    }
  }, [isPlaying]);

  const analyserLRef = useRef(null);
  const analyserRRef = useRef(null);
  const workletAnchorRef = useRef({ pre: null, post: null });
  const loadedModulesRef = useRef({}); // To track which modules are loaded

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

  // Log de telemetria do player (apenas quando faixa ou estado de play muda, nao a cada tick de progresso)
  useEffect(() => {
    if (!currentSong) return;
    if (isPlaying) {
      logToCMD("PLAYER", `Tocando faixa: ${currentSong?.title || 'Desconhecida'}`, "info", 0);
    } else {
      logToCMD("PLAYER", "Música pausada.", "warn", 0);
    }
  }, [currentSong?.title, currentSong?.file, isPlaying]);

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

  // --- ReplayGain / Loudness Leveling Engine ---
  useEffect(() => {
    if (!currentSong || !currentSong.url || !enableReplayGain) {
      if (replayGainNodeRef.current && audioContextRef.current) {
        replayGainNodeRef.current.gain.setTargetAtTime(1.0, audioContextRef.current.currentTime, 0.5);
      }
      return;
    }

    const abortController = new AbortController();

    const processLoudness = async () => {
      try {
        logToCMD("ReplayGain", "Analisando loudness do arquivo em background...", "info");
        
        // Fetch background audio para análise (sem interferir no streaming do player principal)
        const res = await fetch(currentSong.url, { signal: abortController.signal });
        if (!res.ok) throw new Error("Falha ao baixar track para ReplayGain");
        const arrayBuffer = await res.arrayBuffer();

        // O AudioContext nativo é super rápido para decodificar
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, 44100, 44100);
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);

        const { loudnessDb, peakDb } = analyzeTrackLoudness(audioBuffer);
        
        // Determina Target de acordo com lufsMode (Normal, Alto, Noite, etc)
        let targetLufs = -16.0;
        if (lufsMode === 'Normal') targetLufs = -16.0;
        else if (lufsMode === 'Alto') targetLufs = -14.0;
        else if (lufsMode === 'Noite') targetLufs = -20.0;
        else if (lufsMode === 'Seguro') targetLufs = -18.0;

        const { rawGainDb, safeGainDb, peakLimited } = calculateReplayGain({
          measuredLoudnessDb: loudnessDb,
          peakDb: peakDb,
          targetDb: targetLufs,
          ceilingDb: -1.0,
          safetyMarginDb: 0.5
        });

        const gainMultiplier = Math.pow(10, safeGainDb / 20);

        if (replayGainNodeRef.current && audioContextRef.current) {
          replayGainNodeRef.current.gain.setTargetAtTime(gainMultiplier, audioContextRef.current.currentTime, 1.0);
        }

        logToCMD("DSP-ReplayGain", JSON.stringify({
          type: "telemetry",
          name: "ReplayGain",
          track: currentSong.title,
          targetDb: targetLufs.toFixed(1),
          measuredLoudnessDb: loudnessDb.toFixed(1),
          peakDb: peakDb.toFixed(1),
          rawGainDb: rawGainDb.toFixed(1),
          safeGainDb: safeGainDb.toFixed(1),
          peakLimited,
          appliedGain: gainMultiplier.toFixed(3)
        }), "info");

      } catch (e) {
        if (e.name !== 'AbortError') {
           console.warn("ReplayGain Analysis Error:", e);
           if (replayGainNodeRef.current && audioContextRef.current) {
             replayGainNodeRef.current.gain.setTargetAtTime(1.0, audioContextRef.current.currentTime, 0.5);
           }
        }
      }
    };

    processLoudness();

    return () => {
      abortController.abort();
    };
  }, [currentSong, enableReplayGain, lufsMode]);
  
  const audioRef = useRef(null);
  const scrobbledRef = useRef(false);
  
  const [artistPhoto, setArtistPhoto] = useState(null);
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
    } catch { /* Ignore malformed saved EQ data and use the default preset. */ }
    return EQ_PRESETS['Normal'] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  });
  const eqFiltersRef = useRef([]);

  useEffect(() => {
    localStorage.setItem('appmusica_eq_preset', eqPreset);
    localStorage.setItem('appmusica_eq_bands', JSON.stringify(eqGains));
    
    // Apply to Web Audio API filters
    if (eqFiltersRef.current.length === 10 && audioContextRef.current) {
      eqGains.forEach((gain, i) => {
        if (eqFiltersRef.current[i]) {
          eqFiltersRef.current[i].gain.setTargetAtTime(gain, audioContextRef.current.currentTime, 0.1);
        }
      });
    }
  }, [eqGains, eqPreset]);

  useEffect(() => {
    localStorage.setItem('appmusica_preset_intensity', presetIntensity.toString());
  }, [presetIntensity]);


  // Atualiza em tempo real os nós de processamento do DSP
  useEffect(() => {
    if (submonoRef.current && audioContextRef.current) {
      submonoRef.current.port.postMessage({ active: enableSubmono });
    }
  }, [enableSubmono, audioContextRef.current]);

  useEffect(() => {
    if (transientRef.current && audioContextRef.current) {
      transientRef.current.port.postMessage({ active: enableTransient, attackAmount: transientAttack, sustainAmount: transientSustain });
    }
  }, [enableTransient, transientAttack, transientSustain, audioContextRef.current]);

  useEffect(() => {
    if (adaptiveEqRef.current && audioContextRef.current) {
      adaptiveEqRef.current.port.postMessage({ active: enableAdaptiveEq });
    }
  }, [enableAdaptiveEq, audioContextRef.current]);

  useEffect(() => {
    if (deesserRef.current && audioContextRef.current) {
      deesserRef.current.port.postMessage({ active: enableDeesser });
    }
  }, [enableDeesser, audioContextRef.current]);

  useEffect(() => {
    if (deharshRef.current && audioContextRef.current) {
      deharshRef.current.port.postMessage({ active: enableDeharsh });
    }
  }, [enableDeharsh, audioContextRef.current]);

  // Atualiza os filtros de EQ se o currentPreset ou slider mudar
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
      audioRef.current.preservesPitch = preservesPitch;
      audioRef.current.mozPreservesPitch = preservesPitch;
      audioRef.current.webkitPreservesPitch = preservesPitch;
    }
  }, [playbackRate, preservesPitch, currentSong]);

  const ROOM_PRESETS = {
    "Estúdio": { preDelayMs: 6, rt60: 0.8, wetMix: 0.10, wetWidth: 0.70, wetHpf: 150, wetLpf: 10000 },
    "Pequena": { preDelayMs: 6, rt60: 0.8, wetMix: 0.10, wetWidth: 0.70, wetHpf: 150, wetLpf: 10000 },
    "Club": { preDelayMs: 12, rt60: 1.2, wetMix: 0.11, wetWidth: 0.80, wetHpf: 120, wetLpf: 8000 },
    "Hall": { preDelayMs: 18, rt60: 2.2, wetMix: 0.12, wetWidth: 0.80, wetHpf: 150, wetLpf: 10000 },
    "Concerto": { preDelayMs: 18, rt60: 3.5, wetMix: 0.15, wetWidth: 0.85, wetHpf: 120, wetLpf: 10000 },
    "Catedral": { preDelayMs: 28, rt60: 4.5, wetMix: 0.12, wetWidth: 0.90, wetHpf: 180, wetLpf: 12000 },
    "Estádio": { preDelayMs: 22, rt60: 2.8, wetMix: 0.12, wetWidth: 0.85, wetHpf: 80, wetLpf: 14000 },
    "Cave": { preDelayMs: 10, rt60: 1.5, wetMix: 0.08, wetWidth: 0.65, wetHpf: 200, wetLpf: 6000 },
    "Cinema": { preDelayMs: 22, rt60: 2.8, wetMix: 0.10, wetWidth: 0.85, wetHpf: 180, wetLpf: 14000 },
    "Vastidão": { preDelayMs: 10, rt60: 1.5, wetMix: 0.08, wetWidth: 0.65, wetHpf: 200, wetLpf: 6000 },
    
    // Extreme IRs (Sound Design / Experimental)
    "Geleira": { preDelayMs: 30, rt60: 4.0, wetMix: 0.10, wetWidth: 0.90, wetHpf: 150, wetLpf: 10000, isExtreme: true },
    "Praia": { preDelayMs: 15, rt60: 1.5, wetMix: 0.08, wetWidth: 0.75, wetHpf: 200, wetLpf: 8000, isExtreme: true },
    "Tubo": { preDelayMs: 5, rt60: 2.5, wetMix: 0.05, wetWidth: 0.50, wetHpf: 250, wetLpf: 6000, isExtreme: true },
    "Squash": { preDelayMs: 0, rt60: 1.2, wetMix: 0.06, wetWidth: 0.80, wetHpf: 180, wetLpf: 9000, isExtreme: true },
    "Túnel": { preDelayMs: 10, rt60: 4.5, wetMix: 0.06, wetWidth: 0.85, wetHpf: 220, wetLpf: 7000, isExtreme: true },
    "Concreto": { preDelayMs: 8, rt60: 1.8, wetMix: 0.08, wetWidth: 0.80, wetHpf: 150, wetLpf: 11000, isExtreme: true },
    "Tanque": { preDelayMs: 2, rt60: 3.5, wetMix: 0.04, wetWidth: 0.70, wetHpf: 250, wetLpf: 8000, isExtreme: true },
    "Masmorra": { preDelayMs: 20, rt60: 2.5, wetMix: 0.06, wetWidth: 0.75, wetHpf: 200, wetLpf: 6000, isExtreme: true }
  };

  const ROOM_MATERIALS = {
    Madeira: { hfDampingDb: -2.0, midDampingDb: -0.5, wetWidth: 0.80, wetMixMult: 1.0, hpfOffset: 0, lpfOffset: -1000 },
    Concreto: { hfDampingDb: -0.8, midDampingDb: 0.0, wetWidth: 0.85, wetMixMult: 1.1, hpfOffset: 0, lpfOffset: 2000 },
    Vidro: { hfDampingDb: 0.5, midDampingDb: 0.0, wetWidth: 0.90, wetMixMult: 1.2, hpfOffset: -20, lpfOffset: 4000 },
    Tecido: { hfDampingDb: -5.5, midDampingDb: -1.5, wetWidth: 0.65, wetMixMult: 0.70, hpfOffset: 50, lpfOffset: -4000 },
    Pedra: { hfDampingDb: -2.8, midDampingDb: -0.8, wetWidth: 0.70, wetMixMult: 0.95, hpfOffset: 20, lpfOffset: -2000 },
    Metal: { hfDampingDb: 0.0, midDampingDb: 0.5, wetWidth: 0.85, wetMixMult: 1.15, hpfOffset: -10, lpfOffset: 1000 },
    Carpete: { hfDampingDb: -6.0, midDampingDb: -2.0, wetWidth: 0.60, wetMixMult: 0.60, hpfOffset: 80, lpfOffset: -5000 }
  };

  useEffect(() => {
    if (!autoEqPreampRef.current || !autoEqFiltersRef.current || !audioContextRef.current) return;
    
    const ctx = audioContextRef.current;
    if (!autoEqProfile) {
      // Bypass
      autoEqPreampRef.current.gain.setTargetAtTime(1.0, ctx.currentTime, 0.1);
      autoEqFiltersRef.current.forEach(f => {
        f.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      });
      return;
    }

    const effectivePreampDb = autoEqProfile.preampDb * autoEqAmount;
    autoEqPreampRef.current.gain.setTargetAtTime(Math.pow(10, effectivePreampDb / 20), ctx.currentTime, 0.1);

    autoEqFiltersRef.current.forEach((f, index) => {
      if (index < autoEqProfile.filters.length) {
        const pf = autoEqProfile.filters[index];
        f.type = pf.type;
        f.frequency.setTargetAtTime(pf.freq, ctx.currentTime, 0.1);
        f.Q.setTargetAtTime(pf.Q, ctx.currentTime, 0.1);
        f.gain.setTargetAtTime(pf.gainDb * autoEqAmount, ctx.currentTime, 0.1);
      } else {
        f.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      }
    });

    logToCMD("DSP-AutoEQ", JSON.stringify({
      type: "telemetry",
      name: "HeadphoneCorrection",
      model: autoEqProfile.name,
      active: true,
      amount: autoEqAmount.toFixed(2),
      filterCount: autoEqProfile.filters.length,
      maxBoostDb: autoEqProfile.maxBoostDb.toFixed(1),
      preampDb: autoEqProfile.preampDb.toFixed(1),
      effectivePreampDb: effectivePreampDb.toFixed(1),
      safety: autoEqProfile.safety
    }), "info");

  }, [autoEqProfile, autoEqAmount]);

  useEffect(() => {
    abModeRef.current = abMode;
    abBlendRef.current = abBlend;
    if (abComparatorRef.current && abComparatorRef.current.port) {
       abComparatorRef.current.port.postMessage({ mode: abMode, blend: abBlend });
    }
  }, [abMode, abBlend]);

  useEffect(() => {
    let currentPreset = ROOM_PRESETS[spatialMode] || ROOM_PRESETS["Estúdio"];
    let currentMat = ROOM_MATERIALS[roomMaterial] || ROOM_MATERIALS["Madeira"];
    
    // Se mudou de sala, reseta para o wetMix nativo dela
    if (reverbMix === 0.0 && currentPreset.wetMix > 0) {
      setReverbMix(currentPreset.wetMix);
    }

    const targetHpf = Math.min(20000, Math.max(20, currentPreset.wetHpf + (currentMat.hpfOffset || 0)));
    const targetLpf = Math.min(20000, Math.max(20, currentPreset.wetLpf + (currentMat.lpfOffset || 0)));

    if (wetHpfRef.current && currentPreset.wetHpf && audioContextRef.current) {
      wetHpfRef.current.frequency.setTargetAtTime(targetHpf, audioContextRef.current.currentTime, 0.1);
    }
    if (wetLpfRef.current && currentPreset.wetLpf && audioContextRef.current) {
      wetLpfRef.current.frequency.setTargetAtTime(targetLpf, audioContextRef.current.currentTime, 0.1);
    }
    
    // Filtros de Material (Mid e HF Damping)
    if (wetMidEqRef.current && audioContextRef.current) {
      wetMidEqRef.current.gain.setTargetAtTime(currentMat.midDampingDb, audioContextRef.current.currentTime, 0.1);
    }
    if (wetHighEqRef.current && audioContextRef.current) {
      wetHighEqRef.current.gain.setTargetAtTime(currentMat.hfDampingDb, audioContextRef.current.currentTime, 0.1);
    }

    // Safeguard de Wet Mix para Espaços Experimentais (Impede de passar do limite do preset e destruir a música)
    let finalWetMix = reverbMix * (currentMat.wetMixMult || 1.0);
    let energyPenalty = 1.0;
    
    // Proteção Ativa: Se a IR carregada for matematicamente muito quente (RMS alto), penalizamos o ganho máximo dela
    const irRms = currentIrRmsRef.current;
    if (irRms > 0.20) energyPenalty = 0.50;
    else if (irRms > 0.12) energyPenalty = 0.70;
    else if (irRms > 0.08) energyPenalty = 0.85;

    let protectionStr = "NONE";
    let maxWetAllowed = 1.0;

    if (currentPreset.isExtreme) {
      // Se for IR extremo, impõe teto duro para que fader máximo do usuário não passe do limite seguro.
      maxWetAllowed = currentPreset.wetMix * 1.5; // Hard cap em 150% do recomendado
      finalWetMix = reverbMix * currentPreset.wetMix * 2.0; 
      finalWetMix = Math.min(finalWetMix, maxWetAllowed) * energyPenalty; 
      protectionStr = energyPenalty < 1.0 ? "EXTREME_IR_CAP + ENERGY_PENALTY" : "EXTREME_IR_CAP";
    } else {
      finalWetMix = finalWetMix * energyPenalty;
      if (energyPenalty < 1.0) protectionStr = "ENERGY_PENALTY";
    }

    if (dryGainRef.current && dryGainRef.current.port) {
      dryGainRef.current.port.postMessage({ 
         wetMix: finalWetMix, 
         preset: spatialMode,
         material: roomMaterial,
         preDelayMs: currentPreset.preDelayMs,
         rt60: currentPreset.rt60,
         wetWidth: currentPreset.wetWidth * currentMat.wetWidth,
         active: true
      });
    } else if (dryGainRef.current && wetGainRef.current && audioContextRef.current) {
      // Fallback nativo
      dryGainRef.current.gain.setTargetAtTime(1.0 - finalWetMix, audioContextRef.current.currentTime, 0.1);
      wetGainRef.current.gain.setTargetAtTime(finalWetMix, audioContextRef.current.currentTime, 0.1);
    }

    // Telemetria detalhada para ajudar no debugging de Convolution
    logToCMD("DSP-IRSpace", JSON.stringify({
       type: "telemetry",
       name: "IRSpace",
       preset: spatialMode,
       isExtreme: !!currentPreset.isExtreme,
       userWet: reverbMix.toFixed(2),
       effectiveWet: finalWetMix.toFixed(3),
       wetCap: maxWetAllowed.toFixed(3),
       irRms: irRms.toFixed(3),
       energyPenalty: energyPenalty.toFixed(2),
       protection: protectionStr,
       clipRisk: finalWetMix > 0.20 ? "HIGH" : (finalWetMix > 0.10 ? "MEDIUM" : "LOW")
    }), "info");

  }, [reverbMix, spatialMode, roomMaterial]);

  // --- Propagate DSP parameter changes ---
  useEffect(() => {
    if (transientRef.current) transientRef.current.port.postMessage({ attackAmount: transientAttack, sustainAmount: transientSustain });
  }, [transientAttack, transientSustain]);

  useEffect(() => {
    if (saturationRef.current) {
      saturationRef.current.port.postMessage({ mode: satMode, drive: satDrive, mix: satMix, outputTrimDb: saturationOutputTrimDb });
    }
  }, [satMode, satDrive, satMix, saturationOutputTrimDb]);

  useEffect(() => {
    if (crossfeedRef.current) {
      const node = crossfeedRef.current.node;
      if (node && node.port) {
        node.port.postMessage({ crossfeedAmount });
      }
      // Update mock properties for AudioDiagnosticsPanel
      crossfeedRef.current.cfGainLR = { gain: { value: enableCrossfeed ? crossfeedAmount : 0 } };
      crossfeedRef.current.cfGainRL = { gain: { value: enableCrossfeed ? crossfeedAmount : 0 } };
    }
  }, [crossfeedAmount, enableCrossfeed]);

  useEffect(() => {
    if (exciterNodeRef.current && audioContextRef.current) {
      const amountMap = { off: 0.0, subtle: 0.25, medium: 0.5, strong: 0.85 };
      const val = amountMap[harmonicExciter] !== undefined ? amountMap[harmonicExciter] : 0.5;
      exciterNodeRef.current.port.postMessage({ amount: val });
    }
  }, [harmonicExciter]);

  useEffect(() => {
    if (stereoWidthRef.current && audioContextRef.current) {
      const widthMap = { Estreito: 0.5, Natural: 1.0, Largo: 1.4, Ultra: 1.8 };
      const wVal = widthMap[stereoWidth] !== undefined ? widthMap[stereoWidth] : 1.0;
      stereoWidthRef.current.port.postMessage({ width: wVal });
    }
  }, [stereoWidth]);

  useEffect(() => {
    const g = bassEnhancer ? (bassIntensity / 100) : 0.0;
    if (bassEnhancerGainRef.current && audioContextRef.current) {
      bassEnhancerGainRef.current.gain.setTargetAtTime(g, audioContextRef.current.currentTime, 0.1);
    }
    if (submonoRef.current) {
      submonoRef.current.port.postMessage({ bassRecovery: g });
    }
  }, [bassEnhancer, bassIntensity]);

  useEffect(() => {
    if (masteringRef.current) {
      masteringRef.current.port.postMessage({ enablePhaseRotation });
    }
  }, [enablePhaseRotation]);

  useEffect(() => {
    if (spectralGlueRef.current) {
      spectralGlueRef.current.port.postMessage({ active: enableSpectralGlue, threshold: spectralGlueThreshold });
    }
  }, [enableSpectralGlue, spectralGlueThreshold]);

  useEffect(() => {
    if (depthRef.current) {
      depthRef.current.port.postMessage({ active: enableStereoDepth, depth: stereoDepthAmount });
    }
  }, [enableStereoDepth, stereoDepthAmount]);

  useEffect(() => {
    if (transientRef.current) transientRef.current.port.postMessage({ active: enableTransient });
  }, [enableTransient]);

  useEffect(() => {
    if (adaptiveEqRef.current) adaptiveEqRef.current.port.postMessage({ active: enableAdaptiveEq });
  }, [enableAdaptiveEq]);

  useEffect(() => {
    if (deesserRef.current) deesserRef.current.port.postMessage({ active: enableDeesser });
  }, [enableDeesser]);

  // --- Master Safety & Headroom Compensation ---
  useEffect(() => {
    let headroomDb = -6.0; // Padrão seguro para cadeia de múltiplos efeitos

    if (bassEnhancer) headroomDb -= 1.5;
    if (enableSaturation) headroomDb -= 1.0;
    if (reverbMix > 0) headroomDb -= 0.8;
    if (enable8D) headroomDb -= 0.8;
    
    let maxEqBoost = 0;
    for (let i = 0; i < eqGains.length; i++) {
      if (eqGains[i] > maxEqBoost) maxEqBoost = eqGains[i];
    }
    if (maxEqBoost > 3) headroomDb -= 1.5;

    // Apply active sound preset headroom/intensity adjustments
    if (presetHeadroomConfig) {
      const { extraHeadroomDb, intensity } = presetHeadroomConfig;
      headroomDb += (extraHeadroomDb || 0) * intensity;
      if (intensity > 1.0) {
        headroomDb -= (intensity - 1.0) * 1.0;
      }
    }

    // Apply auto-calibration profile gain adjustments
    if (autoCalibProfile) {
      const profileDefaults = getAutoCalibrationProfile(autoCalibProfile.id);
      if (autoCalibProfile.extraHeadroomDb !== undefined) {
        headroomDb += Math.max(-12, Math.min(0, autoCalibProfile.extraHeadroomDb));
      }
      if (autoCalibProfile.makeupDb !== undefined) {
        const maxMakeupDb = profileDefaults?.maxMakeupDb ?? 0;
        headroomDb += Math.max(0, Math.min(maxMakeupDb, autoCalibProfile.makeupDb));
      }
    }

    currentHeadroomDbRef.current = headroomDb;
    if (preGainRef.current && audioContextRef.current) {
      preGainRef.current.gain.setTargetAtTime(Math.pow(10, headroomDb / 20), audioContextRef.current.currentTime, 0.15);
    }
  }, [bassEnhancer, enableSaturation, reverbMix, enable8D, eqGains, autoCalibProfile, presetHeadroomConfig]);

  useEffect(() => {
    if (deharshRef.current) deharshRef.current.port.postMessage({ active: enableDeharsh });
  }, [enableDeharsh]);

  useEffect(() => {
    if (saturationRef.current) saturationRef.current.port.postMessage({ active: enableSaturation });
  }, [enableSaturation]);

  useEffect(() => {
    if (submonoRef.current) submonoRef.current.port.postMessage({ active: enableSubmono });
  }, [enableSubmono]);

  useEffect(() => {
    if (panner8DRef.current && panner8DRef.current.parameters) {
      const wetParam = panner8DRef.current.parameters.get('wet');
      if (wetParam && audioContextRef.current) {
        // Suaviza a transição de bypass em 10ms
        wetParam.setTargetAtTime(enable8D ? 0.20 : 0.0, audioContextRef.current.currentTime, 0.01);
      }
    }
  }, [enable8D]);

  useEffect(() => {
    if (panner8DRef.current && panner8DRef.current.port) {
      panner8DRef.current.port.postMessage({
        motionMode: motionMode,
        radiusM: motionRadius,
        speed: motionSpeed
      });
    }
  }, [motionMode, motionRadius, motionSpeed]);

  // --- Genre Profile Macro Preset ---
  useEffect(() => {
    const GENRE_PROFILES = {
      Rock: { eqLow: 0, eqMid: -1, eqPresence: 1, eqAir: 1, spatialWet: 0.15, roomPreset: 'Club', roomWet: 0.08, depth: 0.3, satDrive: 0.2, satMix: 0.1, bassEnhance: 0.1 },
      Jazz: { eqLow: 0.5, eqMid: -0.5, eqPresence: 0.5, eqAir: 1.0, spatialWet: 0.18, roomPreset: 'Estúdio', roomWet: 0.10, depth: 0.40, satDrive: 0.15, satMix: 0.25, bassEnhance: 0.05 },
      Ambient: { eqLow: 1, eqMid: 0, eqPresence: -1, eqAir: 0, spatialWet: 0.30, roomPreset: 'Hall', roomWet: 0.20, depth: 0.5, satDrive: 0.1, satMix: 0.1, bassEnhance: 0.05 },
      Orchestral: { eqLow: 1.5, eqMid: 0.5, eqPresence: 1.5, eqAir: 2.0, spatialWet: 0.25, roomPreset: 'Hall', roomWet: 0.15, depth: 0.55, satDrive: 0.05, satMix: 0.05, bassEnhance: 0.0 },
      EDM: { eqLow: 2, eqMid: -1.5, eqPresence: 1.5, eqAir: 2.5, spatialWet: 0.20, roomPreset: 'Estúdio', roomWet: 0.08, depth: 0.25, satDrive: 0.3, satMix: 0.2, bassEnhance: 0.15 }
    };
    
    const p = GENRE_PROFILES[genreProfile];
    if (p) {
       // Atualização de Estados Macro (UI irá disparar os micro-hooks suavizados via setTargetAtTime / postMessage)
       setSpatialMode(p.roomPreset);
       setReverbMix(p.roomWet);
       setStereoDepthAmount(p.depth);
       setSatDrive(p.satDrive);
       setBassIntensity(p.bassEnhance * 100);
       
       // Mapping EQ Gains Approximation (10-bands)
       const newGains = [
         p.eqLow, p.eqLow, p.eqLow * 0.5, // Graves
         p.eqMid, p.eqMid * 0.5, p.eqMid * 0.25, // Médios
         p.eqPresence, p.eqPresence, // Presença
         p.eqAir, p.eqAir // Ar/Agudos
       ];
       setEqGains(newGains);
       
       // Override Panner Wet for Spatial 8D se ligado
       if (enable8D && panner8DRef.current && panner8DRef.current.parameters) {
          const wetParam = panner8DRef.current.parameters.get('wet');
          if (wetParam && audioContextRef.current) {
            wetParam.setTargetAtTime(p.spatialWet, audioContextRef.current.currentTime, 0.05);
          }
       }

       if (audioContextRef.current) {
          logToCMD("DSP-GenreProfile", JSON.stringify({
             type: "telemetry",
             name: "GenreProfile",
             profile: genreProfile,
             eqLowDb: p.eqLow.toFixed(1),
             eqMidDb: p.eqMid.toFixed(1),
             eqPresenceDb: p.eqPresence.toFixed(1),
             eqAirDb: p.eqAir.toFixed(1),
             spatialWet: p.spatialWet.toFixed(2),
             roomPreset: p.roomPreset,
             roomWet: p.roomWet.toFixed(2),
             depth: p.depth.toFixed(2),
             saturationDrive: p.satDrive.toFixed(2),
             saturationMix: p.satMix.toFixed(2),
             bassEnhance: p.bassEnhance.toFixed(2),
             applied: true
          }), "info");
       }
     }
  }, [genreProfile, enable8D]);

  const handlePresetApplied = (presetName, intensity, config) => {
    setTimeout(() => {
      const corrVal = stereoTelemetryRef.current ? stereoTelemetryRef.current.corr : 1.0;
      const widthPercent = { 'Estreito': '50%', 'Natural': '100%', 'Largo': '140%', 'Ultra': '180%' }[stereoWidth] || '100%';
      
      const bassMonoSafe = multibandStereoTelemetryRef.current ? multibandStereoTelemetryRef.current.bassMonoSafe : true;

      const limiterGR = masterTelemetryRef.current ? masterTelemetryRef.current.limiterReductionDb : "0.0";
      const peakDb = masterTelemetryRef.current ? masterTelemetryRef.current.peakDb : -12.0;

      const extraHeadroomDb = (config.extraHeadroomDb || 0) * intensity;
      const makeupDb = (config.maxMakeupDb || 0) * intensity;

      const teleObj = {
        name: "SoundPreset",
        preset: presetName,
        intensity: intensity.toFixed(2),
        extraHeadroomDb: extraHeadroomDb.toFixed(1),
        makeupDb: makeupDb.toFixed(1),
        peakPostDb: (typeof peakDb === 'number' ? peakDb : -6.0).toFixed(1),
        limiterGR: limiterGR,
        width: widthPercent,
        corr: (typeof corrVal === 'number' ? corrVal : 1.0).toFixed(2),
        bassMonoSafe: bassMonoSafe,
        status: "OK"
      };

      logToCMD("SoundPreset", JSON.stringify(teleObj), "success");
    }, 800);
  };

  // 8D Audio Motion System Loop
  useEffect(() => {
    if (!enable8D || motionMode === 'Parado') {
      if (panner8DRef.current && audioContextRef.current) {
        const param = panner8DRef.current.parameters ? panner8DRef.current.parameters.get('panAngle') : panner8DRef.current.pan;
        if (param) param.setValueAtTime(0, audioContextRef.current.currentTime);
      }
      return;
    }

    let animationFrameId;
    let theta = 0;

    const updatePan = () => {
      if (!panner8DRef.current || !audioContextRef.current) return;
      
      theta += (motionSpeed * 0.03);
      
      let pan = 0;
      switch (motionMode) {
        case 'Elipse':
          pan = Math.sin(theta);
          break;
        case 'Figura 8':
          pan = Math.sin(2 * theta);
          break;
        case 'Espiral':
          pan = Math.sin(theta) * (0.5 + 0.5 * Math.cos(theta / 5));
          break;
        case 'Vertical':
          pan = Math.sin(theta * 2) * 0.3;
          break;
        case 'Caos':
          pan = Math.sin(theta) * Math.sin(theta * 1.43) * Math.cos(theta * 0.77);
          break;
        case 'Reativo':
          pan = Math.sin(theta) * 0.8;
          break;
        default:
          pan = Math.sin(theta);
      }

      const maxPan = Math.min(1.0, motionRadius / 5.0);
      const targetPan = Math.max(-1.0, Math.min(1.0, pan * maxPan));
      
      const param = panner8DRef.current.parameters ? panner8DRef.current.parameters.get('panAngle') : panner8DRef.current.pan;
      if (param) {
         if (panner8DRef.current.parameters) {
             // O Spatial8D mapeia de -90 a 90 graus
             param.setValueAtTime(targetPan * 90, audioContextRef.current.currentTime);
         } else {
             // Fallback para o StereoPanner antigo
             param.setValueAtTime(targetPan, audioContextRef.current.currentTime);
         }
      }
      
      animationFrameId = requestAnimationFrame(updatePan);
    };

    updatePan();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [enable8D, motionMode, motionSpeed, motionRadius, isPlaying]);

  // Atualizador dinâmico de Impulse Responses (Convolution Reverb)
  useEffect(() => {
    const updateIR = async () => {
       if (!audioContextRef.current || !reverbNodeRef.current) return;
       const ctx = audioContextRef.current;
       const buffer = await loadIR(ctx, spatialMode);
       if (reverbNodeRef.current) {
          reverbNodeRef.current.buffer = buffer;
          if (buffer && buffer.rms) {
             currentIrRmsRef.current = buffer.rms;
          }
       }
    };
    updateIR();
  }, [spatialMode]);

  const ensureAudioContextRunning = async (audioCtx) => {
    if (!audioCtx) return false;
    if (audioCtx.state === "suspended") {
      try {
        await audioCtx.resume();
        lastResumeStatusRef.current = "OK";
        logToCMD("DSP", "AudioContext retomado via helper", "success");
        if (truePeakNodeRef.current && truePeakNodeRef.current.port) {
          truePeakNodeRef.current.port.postMessage({ type: "reset" });
          truePeakNodeRef.current.port.postMessage({ type: "state", isPlaying: isPlayingRef.current });
        }
      } catch (err) {
        lastResumeStatusRef.current = "FAILED";
        console.warn("[AUDIO] Failed to resume AudioContext:", err);
        return false;
      }
    } else if (audioCtx.state === "running") {
      lastResumeStatusRef.current = "OK";
    }
    return audioCtx.state === "running";
  };

  const initAudioVisualizer = async () => {
    if (!audioRef.current || audioContextRef.current) return;
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      
      const splitter = audioCtx.createChannelSplitter(2);
      const analyserL = audioCtx.createAnalyser();
      analyserL.fftSize = 2048;
      const analyserR = audioCtx.createAnalyser();
      analyserR.fftSize = 2048;
      
      const mediaSource = audioCtx.createMediaElementSource(audioRef.current);
      
      const seekGate = audioCtx.createGain();
      seekGateRef.current = seekGate;
      
      const source = audioCtx.createGain(); // Mixer bus
      mediaSource.connect(seekGate);
      seekGate.connect(source);

      // ReplayGain / Auto-Leveling Node
      const replayGainNode = audioCtx.createGain();
      replayGainNodeRef.current = replayGainNode;

      // Load and connect Source Quality Analyzer Node
      let sourceQualityNode;
      try {
        await audioCtx.audioWorklet.addModule('/source-quality-processor.js?v=' + Date.now());
        sourceQualityNode = new AudioWorkletNode(audioCtx, 'source-quality');
        sourceQualityNode.port.onmessage = (e) => {
          if (e.data.type === 'telemetry') {
            sourceQualityTelemetryRef.current = e.data;
          }
        };
        sourceQualityRef.current = sourceQualityNode;
        source.connect(sourceQualityNode);
        sourceQualityNode.connect(replayGainNode);
      } catch (err) {
        console.warn("Failed to load source-quality-processor, bypassing", err);
        source.connect(replayGainNode);
      }

      // QA Denormal Number Fix (Inject 1e-10 DC Noise Floor to prevent CPU denormal spikes)
      const ditherBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
      const ditherData = ditherBuffer.getChannelData(0);
      for (let i = 0; i < ditherData.length; i++) {
        ditherData[i] = (Math.random() * 2 - 1) * 1e-10; // -200dBFS noise
      }
      const ditherSrc = audioCtx.createBufferSource();
      ditherSrc.buffer = ditherBuffer;
      ditherSrc.loop = true;
      ditherSrc.start();
      ditherSrc.connect(source);
      
      // --- AutoEQ Chain ---
      const autoEqPreamp = audioCtx.createGain();
      autoEqPreampRef.current = autoEqPreamp;
      const autoEqFilters = [];
      for(let i=0; i<12; i++) {
         const f = audioCtx.createBiquadFilter();
         f.type = 'peaking';
         f.frequency.value = 1000;
         f.Q.value = 1.0;
         f.gain.value = 0; // Flat por padrão
         autoEqFilters.push(f);
      }
      autoEqFiltersRef.current = autoEqFilters;
      
      replayGainNode.connect(autoEqPreamp);
      autoEqPreamp.connect(autoEqFilters[0]);
      for(let i=0; i<11; i++) {
         autoEqFilters[i].connect(autoEqFilters[i+1]);
      }

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

      // Worklet anchor pre/post
      const preNode = audioCtx.createGain();
      preGainRef.current = preNode;
      const postNode = audioCtx.createGain();
      workletAnchorRef.current = { pre: preNode, post: postNode };

      autoEqFilters[11].connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i+1]);
      }

      // Filtro de Oclusão (para diagnóstico e efeitos futuros de atenuação)
      const occlusionNode = audioCtx.createBiquadFilter();
      occlusionNode.type = 'lowpass';
      occlusionNode.frequency.value = 20000;
      occlusionFilterRef.current = occlusionNode;

      filters[filters.length - 1].connect(occlusionNode);
      occlusionNode.connect(preNode);

      // Bass Enhancer Psicoacústico (Caminho paralelo: preNode -> LPF -> Shaper -> Gain -> postNode)
      const bassLPF = audioCtx.createBiquadFilter();
      bassLPF.type = 'lowpass';
      bassLPF.frequency.value = 120;

      const bassShaper = audioCtx.createWaveShaper();
      const bassCurve = new Float32Array(512);
      const bassAmount = 5.0;
      let maxVal = 0.0;
      
      // Gera a curva bruta
      for (let i = 0; i < 512; i++) {
        let x = (i * 2) / 511 - 1; // 511 garante -1.0 a +1.0 exatos
        let y = x + bassAmount * (x - (x * x * x) / 3);
        bassCurve[i] = y;
        if (Math.abs(y) > maxVal) maxVal = Math.abs(y);
      }
      
      // Normaliza estritamente para [-1.0, 1.0] para não explodir o filtro de Oversampling do Chromium
      if (maxVal > 0) {
        for (let i = 0; i < 512; i++) {
          bassCurve[i] /= maxVal;
        }
      }
      
      bassShaper.curve = bassCurve;
      bassShaper.oversample = '4x';
      bassShaperRef.current = bassShaper;

      const bassEnhancerGain = audioCtx.createGain();
      bassEnhancerGain.gain.value = bassEnhancer ? (bassIntensity / 100) : 0.0;
      bassEnhancerGainRef.current = bassEnhancerGain;

      preNode.connect(bassLPF);
      bassLPF.connect(bassShaper);
      bassShaper.connect(bassEnhancerGain);
      bassEnhancerGain.connect(postNode);

      // --- DSP Chain Assembly ---
      let currentNode = preNode;

      const loadModule = async (path) => {
        if (!loadedModulesRef.current[path]) {
          const cacheBuster = `?v=${Date.now()}`;
          await audioCtx.audioWorklet.addModule(path + cacheBuster);
          loadedModulesRef.current[path] = true;
        }
      };

      await loadModule('/transient-processor.js');
      const transientNode = new AudioWorkletNode(audioCtx, 'transient-shaper');
      transientNode.port.postMessage({ active: enableTransient, attackAmount: transientAttack, sustainAmount: transientSustain });
      transientRef.current = transientNode;
      currentNode.connect(transientNode);
      currentNode = transientNode;

      await loadModule('/adaptive-eq-processor.js');
      const adaptiveEqNode = new AudioWorkletNode(audioCtx, 'adaptive-eq');
      adaptiveEqNode.port.postMessage({ active: enableAdaptiveEq });
      adaptiveEqRef.current = adaptiveEqNode;
      currentNode.connect(adaptiveEqNode);
      currentNode = adaptiveEqNode;

      await loadModule('/deesser-processor.js');
      const deesserNode = new AudioWorkletNode(audioCtx, 'deesser');
      deesserNode.port.postMessage({ active: enableDeesser });
      deesserNode.port.onmessage = () => {
        // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
      };
      deesserRef.current = deesserNode;
      currentNode.connect(deesserNode);
      currentNode = deesserNode;

      await loadModule('/deharsh-processor.js');
      const deharshNode = new AudioWorkletNode(audioCtx, 'deharsh');
      deharshNode.port.postMessage({ active: enableDeharsh });
      deharshNode.port.onmessage = () => {
        // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
      };
      deharshRef.current = deharshNode;
      currentNode.connect(deharshNode);
      currentNode = deharshNode;

      await loadModule('/saturation-processor.js');
      const saturationNode = new AudioWorkletNode(audioCtx, 'saturation');
      saturationNode.port.postMessage({ active: enableSaturation, mode: satMode, drive: satDrive, mix: satMix, outputTrimDb: saturationOutputTrimDb });
      saturationRef.current = saturationNode;
      currentNode.connect(saturationNode);
      currentNode = saturationNode;

      saturationNode.port.onmessage = () => {
        // if (e.data.type === 'telemetry') {
        //   logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
        // }
      };

      await loadModule('/submono-processor.js');
      const submonoNode = new AudioWorkletNode(audioCtx, 'submono');
      submonoNode.port.postMessage({ active: enableSubmono });
      submonoNode.port.onmessage = () => {
        // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
      };
      submonoRef.current = submonoNode;
      currentNode.connect(submonoNode);
      currentNode = submonoNode;

      await loadModule('/crossfeed-processor.js');
      const crossfeedNode = new AudioWorkletNode(audioCtx, 'crossfeed');
      crossfeedNode.port.postMessage({ active: enableCrossfeed, crossfeedAmount });
      crossfeedRef.current = { 
        cfGainLR: { gain: { value: enableCrossfeed ? crossfeedAmount : 0 } }, 
        cfGainRL: { gain: { value: enableCrossfeed ? crossfeedAmount : 0 } },
        node: crossfeedNode 
      }; 
      currentNode.connect(crossfeedNode);
      currentNode = crossfeedNode;

      currentNode.connect(postNode);

      // --- Multiband Width Processor (Crossovers SVF TPT & M/S Potência Constante) ---
      await loadModule('/multiband-width-processor.js');
      const mbWidthNode = new AudioWorkletNode(audioCtx, 'multiband-width');
      const widthMap = { Estreito: 0.5, Natural: 1.0, Largo: 1.4, Ultra: 1.8 };
      const wVal = widthMap[stereoWidth] !== undefined ? widthMap[stereoWidth] : 1.0;
      mbWidthNode.port.postMessage({ width: wVal });
      mbWidthNode.port.onmessage = (e) => {
        if (e.data && e.data.type === 'telemetry') {
          multibandStereoTelemetryRef.current = e.data;
        }
      };
      stereoWidthRef.current = mbWidthNode;
      
      // --- Harmonic Exciter (High-Pass Parallel Saturation com ADAA e 2x Oversampling) ---
      await loadModule('/exciter-processor.js');
      const exciterNode = new AudioWorkletNode(audioCtx, 'exciter');
      const amountMap = { off: 0.0, subtle: 0.25, medium: 0.5, strong: 0.85 };
      const exciterVal = amountMap[harmonicExciter] !== undefined ? amountMap[harmonicExciter] : 0.5;
      exciterNode.port.postMessage({ amount: exciterVal });
      exciterNodeRef.current = exciterNode;
      
      postNode.connect(exciterNode);
      
      let nextNodeAfterExciter = exciterNode;
      try {
        await loadModule('/depth-processor.js');
        const depthNode = new AudioWorkletNode(audioCtx, 'depth');
        depthNode.port.postMessage({ active: enableStereoDepth, depth: stereoDepthAmount });
        depthNode.port.onmessage = () => {
          // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
        };
        depthRef.current = depthNode;
        exciterNode.connect(depthNode);
        nextNodeAfterExciter = depthNode;
      } catch (e) {
        console.warn("Lumina depth load failed, skipping", e);
      }
      
      nextNodeAfterExciter.connect(mbWidthNode);

      // Split para Dry e Wet(Reverb)
      let roomTelemetryNode;
      try {
        await loadModule(`/room-telemetry-processor.js?v=${Date.now()}`);
        roomTelemetryNode = new AudioWorkletNode(audioCtx, 'room-telemetry', { 
           numberOfInputs: 2, 
           numberOfOutputs: 1,
           outputChannelCount: [2]
        });
        roomTelemetryNode.port.postMessage({ 
           preset: spatialMode,
           wetMix: reverbMix,
           preDelayMs: 18, 
           rt60: 3.5
        });
        roomTelemetryNode.port.onmessage = () => {
          // se quiser debugar a sala, descomente abaixo
          // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
        };
      } catch (e) {
        console.warn("Room telemetry load failed", e);
        // Fallback
        roomTelemetryNode = audioCtx.createGain();
      }
      
      dryGainRef.current = roomTelemetryNode;
      wetGainRef.current = audioCtx.createGain(); // Preservado caso ocorra fallback
      
      mbWidthNode.connect(roomTelemetryNode, 0, 0);
      
      // Convolver Engine (Sempre conectado para alimentar Input 1 do Telemetry Node)
      const convolver = audioCtx.createConvolver();
      convolver.buffer = await loadIR(audioCtx, spatialMode);
      reverbNodeRef.current = convolver;
      
      // Filtros de Proteção para a cauda do Reverb (HPF 150Hz, LPF 10kHz)
      const wetHpf = audioCtx.createBiquadFilter();
      wetHpf.type = 'highpass';
      wetHpf.frequency.value = 150; 
      wetHpfRef.current = wetHpf;
      
      const wetMidEq = audioCtx.createBiquadFilter();
      wetMidEq.type = 'peaking';
      wetMidEq.frequency.value = 1000;
      wetMidEq.Q.value = 0.7;
      wetMidEq.gain.value = 0.0;
      wetMidEqRef.current = wetMidEq;
      
      const wetHighEq = audioCtx.createBiquadFilter();
      wetHighEq.type = 'highshelf';
      wetHighEq.frequency.value = 4000;
      wetHighEq.gain.value = 0.0;
      wetHighEqRef.current = wetHighEq;
      
      const wetLpf = audioCtx.createBiquadFilter();
      wetLpf.type = 'lowpass';
      wetLpf.frequency.value = 10000;
      wetLpfRef.current = wetLpf;
      wetLpfRef.current = wetLpf;
      
      mbWidthNode.connect(convolver);
      convolver.connect(wetHpf);
      wetHpf.connect(wetMidEq);
      wetMidEq.connect(wetHighEq);
      wetHighEq.connect(wetLpf);
      
      if (roomTelemetryNode.numberOfInputs === 2) {
         wetLpf.connect(roomTelemetryNode, 0, 1);
      } else {
         wetLpf.connect(wetGainRef.current);
         wetGainRef.current.connect(roomTelemetryNode);
      }

      // --- Mastering & LUFS ---
      const masterSum = audioCtx.createGain();
      roomTelemetryNode.connect(masterSum);
      masterGainRef.current = masterSum;

      let finalNode = masterSum;

      try {
        await loadModule('/spectral-glue-processor.js');
        const glueNode = new AudioWorkletNode(audioCtx, 'spectral-glue');
        glueNode.port.postMessage({ active: enableSpectralGlue, threshold: spectralGlueThreshold });
        spectralGlueRef.current = glueNode;
        finalNode.connect(glueNode);
        finalNode = glueNode;
      } catch (e) {
        console.warn("Spectral glue load failed, skipping", e);
      }

      try {
        await loadModule('/lumina-mastering.js');
        const masteringNode = new AudioWorkletNode(audioCtx, 'lumina-mastering');
        masteringNode.port.postMessage({ enablePhaseRotation });
        masteringNode.port.onmessage = () => {
          // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
        };
        masteringRef.current = masteringNode;
        finalNode.connect(masteringNode);
        finalNode = masteringNode;
      } catch (e) {
        console.warn("Lumina mastering load failed, skipping", e);
      }

      try {
        await loadModule('/lufs-meter-processor.js');
        const lufsNode = new AudioWorkletNode(audioCtx, 'lufs-meter');
        
        let lastLufsLogTime = 0;
        lufsNode.port.onmessage = (msg) => {
          if (msg.data && msg.data.lufs !== undefined) {
            const val = Math.round(msg.data.lufs * 10) / 10;
            setLufsValue(val);
            
            // Log de telemetria a cada 5 segundos para não floodar o CMD
            const now = Date.now();
            if (now - lastLufsLogTime > 5000) {
              logToCMD("LUFS", `Nível de LUFS Integrado: ${val} dB`, val < -10 ? "success" : "warn");
              lastLufsLogTime = now;
            }
          }
        };
        lufsRef.current = lufsNode;
        finalNode.connect(lufsNode);
        finalNode = lufsNode;
      } catch (e) {
        console.warn("LUFS meter load failed", e);
      }
      
      // 8D Binaural Stereo Panner
      let panner8DNode;
      try {
        await loadModule('/spatial8d-processor.js');
        panner8DNode = new AudioWorkletNode(audioCtx, 'spatial8d');
        const wetParam = panner8DNode.parameters.get('wet');
        if (wetParam) wetParam.value = enable8D ? 0.20 : 0.0;
        
        panner8DNode.port.onmessage = () => {
          // se quiser debugar o panner, descomente abaixo
          // if (e.data.type === 'telemetry') logToCMD(`DSP-${e.data.name}`, JSON.stringify(e.data), "info");
        };
      } catch (e) {
        console.warn("Spatial 8D load failed", e);
        panner8DNode = audioCtx.createStereoPanner();
        panner8DNode.pan.value = 0.0;
      }
      panner8DRef.current = panner8DNode;

      // Master Safety Limiter
      const limiterNode = audioCtx.createDynamicsCompressor();
      limiterNode.threshold.value = -1.0;
      limiterNode.knee.value = 0.0;
      limiterNode.ratio.value = 20.0;
      limiterNode.attack.value = 0.005; // 5ms lookahead
      limiterNode.release.value = 0.080; // 80ms
      limiterRef.current = limiterNode;

      let truePeakNode = limiterNode;
      try {
        await loadModule('/master-out-processor.js');
        truePeakNode = new AudioWorkletNode(audioCtx, 'master-out');
        truePeakNodeRef.current = truePeakNode;
        truePeakNode.port.postMessage({
          type: "state",
          isPlaying: isPlayingRef.current
        });
        truePeakNode.port.onmessage = (e) => {
          if (e.data.type === 'telemetry') {
            const data = e.data;
            let reductionDb = 0.0;
            if (limiterRef.current && limiterRef.current.reduction !== undefined) {
              reductionDb = typeof limiterRef.current.reduction === 'number' ? limiterRef.current.reduction : limiterRef.current.reduction.value;
            }
            const preGainDb = 20 * Math.log10(preGainRef.current ? preGainRef.current.gain.value : 1.0);
            
            // Performance Governor actions (based on CPU latency and 10s sliding window underruns)
            const cpuMs = data.avgCpuMs ? parseFloat(data.avgCpuMs) : 0;
            const underruns = data.recentUnderruns ? parseInt(data.recentUnderruns) : 0;
            let currentRisk = "LOW";
            if (cpuMs > 2.5 || underruns > 5) {
              currentRisk = "CRITICAL";
            } else if (cpuMs > 1.8 || underruns > 1) {
              currentRisk = "MEDIUM";
            }
            
            const now = Date.now();
            
            // Histerese / Cooldown do Governor
            if (currentRisk === "CRITICAL") {
              lowStreakStartMsRef.current = 0; // Reseta timer de restauração
              
              if (!governorActiveRef.current) {
                if (criticalStreakStartMsRef.current === 0) {
                  criticalStreakStartMsRef.current = now;
                }
                // Se mantiver em CRITICAL por >= 500ms
                if (now - criticalStreakStartMsRef.current >= 500) {
                  governorActiveRef.current = true;
                  lastGovernorChangeMsRef.current = now;
                  
                  if (enableTransientRef.current && !governorOverrideRef.current.transientBypassed) {
                    if (transientRef.current && transientRef.current.port) {
                      transientRef.current.port.postMessage({ active: false });
                    }
                    governorOverrideRef.current.transientBypassed = true;
                  }
                  if (enableAdaptiveEqRef.current && !governorOverrideRef.current.adaptiveEqBypassed) {
                    if (adaptiveEqRef.current && adaptiveEqRef.current.port) {
                      adaptiveEqRef.current.port.postMessage({ active: false });
                    }
                    governorOverrideRef.current.adaptiveEqBypassed = true;
                  }
                }
              }
              // Se o governor estiver ativo ou prestes a ficar, estabiliza o risco como CRITICAL
              if (governorActiveRef.current) {
                governorRiskRef.current = "CRITICAL";
              }
            } else {
              criticalStreakStartMsRef.current = 0; // Reseta timer de sobrecarga
              
              if (governorActiveRef.current) {
                if (currentRisk === "LOW") {
                  if (lowStreakStartMsRef.current === 0) {
                    lowStreakStartMsRef.current = now;
                  }
                  // Restaura após 3 segundos de calmaria (LOW) e pelo menos 3 segundos desde a última mudança
                  if (now - lowStreakStartMsRef.current >= 3000 && now - lastGovernorChangeMsRef.current >= 3000) {
                    governorActiveRef.current = false;
                    lastGovernorChangeMsRef.current = now;
                    
                    if (governorOverrideRef.current.transientBypassed) {
                      if (transientRef.current && transientRef.current.port) {
                        transientRef.current.port.postMessage({ active: enableTransientRef.current });
                      }
                      governorOverrideRef.current.transientBypassed = false;
                    }
                    if (governorOverrideRef.current.adaptiveEqBypassed) {
                      if (adaptiveEqRef.current && adaptiveEqRef.current.port) {
                        adaptiveEqRef.current.port.postMessage({ active: enableAdaptiveEqRef.current });
                      }
                      governorOverrideRef.current.adaptiveEqBypassed = false;
                    }
                    governorRiskRef.current = "LOW";
                  } else {
                    // Mantém estado ativo e risco estável como CRITICAL durante a contagem regressiva
                    governorRiskRef.current = "CRITICAL";
                  }
                } else {
                  // Se subiu para MEDIUM, interrompe a contagem para voltar a LOW
                  lowStreakStartMsRef.current = 0;
                  governorRiskRef.current = "CRITICAL";
                }
              } else {
                governorRiskRef.current = currentRisk; // LOW ou MEDIUM
              }
            }

            const stabilizedRisk = governorRiskRef.current;
            const uiFps = stabilizedRisk === "CRITICAL" ? 15 : (stabilizedRisk === "MEDIUM" ? 30 : 60);
            
            const actions = [];
            if (governorOverrideRef.current.transientBypassed) actions.push("BYPASS_TRANSIENT");
            if (governorOverrideRef.current.adaptiveEqBypassed) actions.push("BYPASS_ADAPTIVE_EQ");
            if (stabilizedRisk === "CRITICAL" || stabilizedRisk === "MEDIUM") actions.push("REDUCE_VISUAL_REFRESH");

            const restorePending = governorActiveRef.current && currentRisk === "LOW";

            const tele = {
              type: "telemetry",
              name: "MasterOut",
              headroomDb: preGainDb.toFixed(1),
              preGain: (preGainRef.current ? preGainRef.current.gain.value : 1.0).toFixed(3),
              peakDb: data.peakDb,
              peakPreMasterDb: data.peakPreMasterDb,
              clipCount: data.clipCount,
              limiterReductionDb: (typeof reductionDb === 'number' ? Math.abs(reductionDb) : 0).toFixed(1),
              volume: audioRef.current ? audioRef.current.volume.toFixed(2) : "1.00",
              safeBypassActive: masterTelemetryRef.current?.safeBypassActive || false,
              avgCpuMs: data.avgCpuMs,
              cpuLoad: data.cpuLoad,
              underruns: data.underruns,
              recentUnderruns: data.recentUnderruns || 0,
              cpuTimingQuality: data.cpuTimingQuality || "HIGH RES",
              governorActive: governorActiveRef.current,
              governorRisk: stabilizedRisk,
              uiFps: uiFps,
              actions: actions,
              restorePending: restorePending
            };
            
            masterTelemetryRef.current = tele;
            logToCMD("DSP-MasterOut", JSON.stringify(tele), data.clipCount > 0 ? "error" : "success", 2000);

            const nowLog = Date.now();
            if (stabilizedRisk !== lastPerformanceGovernorRiskRef.current || nowLog - lastPerformanceGovernorLogTimeRef.current > 5000) {
              lastPerformanceGovernorRiskRef.current = stabilizedRisk;
              lastPerformanceGovernorLogTimeRef.current = nowLog;
              
              logToCMD("PerformanceGovernor", JSON.stringify({
                type: "telemetry",
                name: "PerformanceGovernor",
                risk: stabilizedRisk,
                avgCpuMs: cpuMs.toFixed(2),
                budgetMs: "2.90",
                cpuLoad: data.cpuLoad,
                uiFps: uiFps,
                actions: actions,
                userSettingsPreserved: true,
                restorePending: restorePending
              }), stabilizedRisk === "CRITICAL" ? "error" : stabilizedRisk === "MEDIUM" ? "warning" : "success");
            }
          } else if (e.data.type === 'error') {
            const tele = {
              ...masterTelemetryRef.current,
              type: "error",
              name: "MasterOut",
              safeBypassActive: e.data.safeBypassActive,
              message: e.data.message
            };
            masterTelemetryRef.current = tele;
            logToCMD("DSP-MasterOut-Error", JSON.stringify(tele), "error");
          } else if (e.data.type === 'status' && e.data.status === 'RECOVERED') {
            const tele = {
              ...masterTelemetryRef.current,
              type: "telemetry",
              name: "MasterOut",
              safeBypassActive: false
            };
            masterTelemetryRef.current = tele;
            logToCMD("DSP-MasterOut-Status", "Processador MasterOut recuperado com sucesso.", "success");
          }
        };
        limiterNode.connect(truePeakNode);
      } catch (e) {
        console.warn("Master Out / Peak Guard load failed", e);
      }

      finalNode.connect(panner8DNode);
      panner8DNode.connect(analyser);
      
      // Conectar Splitter para o Vectorscope
      panner8DNode.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, 1);
      
      // --- AB Comparator ---
      let abComparatorNode;
      try {
        await loadModule('/ab-comparator-processor.js');
        abComparatorNode = new AudioWorkletNode(audioCtx, 'ab-comparator-processor', {
           numberOfInputs: 3,
           numberOfOutputs: 1,
           outputChannelCount: [2]
        });
        
        abComparatorNode.port.postMessage({ mode: abModeRef.current, blend: abBlendRef.current });
        
        let lastAbLogTime = 0;
        abComparatorNode.port.onmessage = (e) => {
           if (e.data.type === 'telemetry') {
              const now = Date.now();
              if (now - lastAbLogTime > 2000) {
                 logToCMD("DSP-ABCompare", JSON.stringify({
                   type: "telemetry",
                   name: "ABCompare",
                   mode: abModeRef.current,
                   blend: abBlendRef.current.toFixed(2),
                   refRMSDb: (20 * Math.log10(Math.max(e.data.refRMS, 1e-12))).toFixed(1),
                   procRMSDb: (20 * Math.log10(Math.max(e.data.procRMS, 1e-12))).toFixed(1),
                   diffRMSDb: (20 * Math.log10(Math.max(e.data.diffRMS, 1e-12))).toFixed(1)
                 }), "info");
                 lastAbLogTime = now;
              }
           }
        };
      } catch (e) {
        console.warn("AB Comparator load failed", e);
        abComparatorNode = audioCtx.createGain(); // Fallback
      }
      abComparatorRef.current = abComparatorNode;
      
      // Routing to AB Comparator
      // Input 0: Calibrated Reference (AutoEQ out)
      autoEqFilters[11].connect(abComparatorNode, 0, 0);
      
      // Input 1: Processed (Analyser out)
      analyser.connect(abComparatorNode, 0, 1);
      
      // Input 2: RAW (Source direct)
      source.connect(abComparatorNode, 0, 2);

      // --- Stereo Scope / Vectorscope ---
      let stereoScopeNode;
      try {
        await loadModule('/stereo-scope-processor.js');
        stereoScopeNode = new AudioWorkletNode(audioCtx, 'stereo-scope-processor', {
           numberOfInputs: 1,
           numberOfOutputs: 1,
           outputChannelCount: [2]
        });
        
        let lastScopeLogTime = 0;
        stereoScopeNode.port.onmessage = (e) => {
           if (e.data.type === 'telemetry') {
              stereoTelemetryRef.current = e.data;
              const now = Date.now();
              // To avoid log spam, we update ref for canvas fast, but log to CMD every 2s
              if (now - lastScopeLogTime > 2000) {
                 logToCMD("DSP-StereoScope", JSON.stringify({
                   type: "telemetry",
                   name: "StereoScope",
                   corr: e.data.corr,
                   midRMSDb: e.data.midRMSDb,
                   sideRMSDb: e.data.sideRMSDb,
                   widthDb: e.data.widthDb,
                   phaseRisk: e.data.phaseRisk
                 }), e.data.phaseRisk === "HIGH" ? "error" : e.data.phaseRisk === "MEDIUM" ? "warn" : "info");
                 lastScopeLogTime = now;
              }
           }
        };
      } catch (e) {
        console.warn("Stereo Scope load failed", e);
        stereoScopeNode = audioCtx.createGain(); // Fallback
      }
      stereoScopeRef.current = stereoScopeNode;

      abComparatorNode.connect(stereoScopeNode);
      stereoScopeNode.connect(limiterNode);
      
      truePeakNode.connect(audioCtx.destination);
      
      await ensureAudioContextRunning(audioCtx);
      
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;
      analyserLRef.current = analyserL;
      analyserRRef.current = analyserR;
      
      logToCMD("DSP", "Pipeline de AudioWorklets inicializada (Zero NaNs)", "success");
      
      drawVisualizer();
    } catch (e) {
      logToCMD("DSP-ERROR", `Erro fatal no DSP: ${e.message}`, "error");
      console.error("Erro ao inicializar visualizador/equalizador/dsp:", e);
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
      const rootStyles = getComputedStyle(document.documentElement);
      const primaryColor = rootStyles.getPropertyValue('--md-sys-color-primary').trim() || '#3b82f6';
      
      let barHeight;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i];
        
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
          .then(async () => {
            setIsPlaying(true);
            await ensureAudioContextRunning(audioContextRef.current);
          })
          .catch(err => console.error('Stream playback error:', err));
      }
      // Set basic metadata from song object
      setMetadata({
        title: currentSong.title,
        artist: currentSong.artist || '',
        coverUrl: currentSong.thumbnail || '',
      });
    } else if (currentSong.file) {
      const urlPath = currentSong.file.split(/[\\/]/).map(encodeURIComponent).join('/');
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
        if (truePeakNodeRef.current && truePeakNodeRef.current.port) {
          truePeakNodeRef.current.port.postMessage({ type: "reset" });
        }
        audioRef.current.play()
          .then(async () => {
            setIsPlaying(true);
            await ensureAudioContextRunning(audioContextRef.current);
          })
          .catch(err => {
            console.error("Playback error:", err);
          });
      }
    }
  }, [currentSong]);

  const togglePlay = async () => {
    if (!audioRef.current) return;
    await initAudioVisualizer();
    await ensureAudioContextRunning(audioContextRef.current);
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().then(async () => {
        await ensureAudioContextRunning(audioContextRef.current);
      }).catch(console.error);
    }
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
        } catch { /* Scrobbling must never interrupt playback. */ }
      }


      if (curr >= dur && dur > 0) {
        if (isLooping) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().then(async () => {
            await ensureAudioContextRunning(audioContextRef.current);
          }).catch(console.error);
        } else {
          setIsPlaying(false);
          if (onFinish) onFinish();
        }
      }
    }
  };

  const resetAllDspStates = (reason = 'seek') => {
    const resettableWorklets = [
      transientRef, adaptiveEqRef, deesserRef, deharshRef, saturationRef,
      submonoRef, masteringRef, spectralGlueRef, depthRef, panner8DRef,
      stereoWidthRef, exciterNodeRef, stereoScopeRef, sourceQualityRef
    ];
    resettableWorklets.forEach(ref => {
      if (ref.current?.port) ref.current.port.postMessage({ type: 'reset', reason });
    });

    // Native ConvolverNodes have no reset method. Reassigning the IR flushes
    // the internal overlap/tail state before audio is allowed back through.
    if (reverbNodeRef.current) {
      try {
        const impulseResponse = reverbNodeRef.current.buffer;
        reverbNodeRef.current.buffer = null;
        if (impulseResponse) reverbNodeRef.current.buffer = impulseResponse;
      } catch (err) {
        console.warn('Failed to reset convolver during seek', err);
      }
    }

    if (truePeakNodeRef.current?.port) {
      truePeakNodeRef.current.port.postMessage({ type: 'reset', reason });
      truePeakNodeRef.current.port.postMessage({ type: 'resetClips', reason });
    }
  };

  const handleSeek = (e) => {
    const time = Number(e.target.value);
    if (!audioRef.current) return;

    const audioCtx = audioContextRef.current;
    if (audioCtx && seekGateRef.current) {
      const now = audioCtx.currentTime;
      seekGateRef.current.gain.cancelScheduledValues(now);
      seekGateRef.current.gain.setValueAtTime(seekGateRef.current.gain.value, now);
      seekGateRef.current.gain.setTargetAtTime(0.0001, now, 0.015);

      if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
      seekTimeoutRef.current = setTimeout(() => {
        resetAllDspStates('seek');
        if (audioRef.current) {
          audioRef.current.currentTime = time;
          setProgress(time);
        }
        const now2 = audioCtx.currentTime;
        const seekSafeGain = Math.pow(10, SEEK_TEMP_HEADROOM_DB / 20);
        seekGateRef.current.gain.cancelScheduledValues(now2);
        seekGateRef.current.gain.setValueAtTime(0.0001, now2);
        seekGateRef.current.gain.setTargetAtTime(seekSafeGain, now2, 0.03);
        // Hold the extra margin through the resumed transient, then return to unity.
        seekGateRef.current.gain.setTargetAtTime(1.0, now2 + 0.08, 0.03);
        seekTimeoutRef.current = null;
      }, 60);
    } else {
      // Fallback
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

  useEffect(() => {
    if (activeLineIndex !== -1 && lyricsContainerRef.current && isExpanded) {
      const container = lyricsContainerRef.current;
      const activeElement = container.children[activeLineIndex];
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeLineIndex, isExpanded]);

  if (!currentSong) return null;

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

                <RippleButton 
                  onClick={() => setShowDiagnostics(true)} 
                  className="text-on-surface-variant/50 hover:text-on-surface transition-colors" 
                  title="Diagnóstico de Áudio"
                >
                  <Activity size={24} />
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
          // DSP Props
          enableTransient={enableTransient} setEnableTransient={setEnableTransient}
          transientAttack={transientAttack} setTransientAttack={setTransientAttack}
          transientSustain={transientSustain} setTransientSustain={setTransientSustain}
          enableAdaptiveEq={enableAdaptiveEq} setEnableAdaptiveEq={setEnableAdaptiveEq}
          enableDeesser={enableDeesser} setEnableDeesser={setEnableDeesser}
          enableDeharsh={enableDeharsh} setEnableDeharsh={setEnableDeharsh}
          enableSaturation={enableSaturation} setEnableSaturation={setEnableSaturation}
          satDrive={satDrive} setSatDrive={setSatDrive}
          satMode={satMode} setSatMode={setSatMode}
          enableSubmono={enableSubmono} setEnableSubmono={setEnableSubmono}
          enableCrossfeed={enableCrossfeed} setEnableCrossfeed={setEnableCrossfeed}
          crossfeedAmount={crossfeedAmount} setCrossfeedAmount={setCrossfeedAmount}
          // New DSP Props
          enable8D={enable8D} setEnable8D={setEnable8D}
          motionMode={motionMode} setMotionMode={setMotionMode}
          motionSpeed={motionSpeed} setMotionSpeed={setMotionSpeed}
          motionRadius={motionRadius} setMotionRadius={setMotionRadius}
          stereoWidth={stereoWidth} setStereoWidth={setStereoWidth}
          bassEnhancer={bassEnhancer} setBassEnhancer={setBassEnhancer}
          bassIntensity={bassIntensity} setBassIntensity={setBassIntensity}
          roomMorphing={roomMorphing} setRoomMorphing={setRoomMorphing}
          lufsMode={lufsMode} setLufsMode={setLufsMode}
          spatialMode={spatialMode} setSpatialMode={setSpatialMode}
          roomMaterial={roomMaterial} setRoomMaterial={setRoomMaterial}
          genreProfile={genreProfile} setGenreProfile={setGenreProfile}
          harmonicExciter={harmonicExciter} setHarmonicExciter={setHarmonicExciter}
          enablePhaseRotation={enablePhaseRotation} setEnablePhaseRotation={setEnablePhaseRotation}
          enableSpectralGlue={enableSpectralGlue} setEnableSpectralGlue={setEnableSpectralGlue}
          spectralGlueThreshold={spectralGlueThreshold} setSpectralGlueThreshold={setSpectralGlueThreshold}
          enableStereoDepth={enableStereoDepth} setEnableStereoDepth={setEnableStereoDepth}
          stereoDepthAmount={stereoDepthAmount} setStereoDepthAmount={setStereoDepthAmount}
          enableReplayGain={enableReplayGain} setEnableReplayGain={setEnableReplayGain}
          autoEqProfile={autoEqProfile} setAutoEqProfile={setAutoEqProfile}
          autoEqAmount={autoEqAmount} setAutoEqAmount={setAutoEqAmount}
          abMode={abMode} setAbMode={setAbMode}
          abBlend={abBlend} setAbBlend={setAbBlend}
          presetIntensity={presetIntensity}
          setPresetIntensity={setPresetIntensity}
          setPresetHeadroomConfig={setPresetHeadroomConfig}
          onPresetApplied={handlePresetApplied}
        />
      )}

      {showDiagnostics && (
        <AudioDiagnosticsPanel
          isOpen={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
          currentSong={currentSong}
          isPlaying={isPlaying}
          audioRef={audioRef}
          audioContextRef={audioContextRef}
          analyserRef={analyserRef}
          masterGainRef={masterGainRef}
          crossfeedRef={crossfeedRef}
          stereoWidthRef={stereoWidthRef}
          exciterNodeRef={exciterNodeRef}
          limiterRef={limiterRef}
          occlusionFilterRef={occlusionFilterRef}
          workletAnchorRef={workletAnchorRef}
          eqFiltersRef={eqFiltersRef}
          wetHpfRef={wetHpfRef}
          wetMidEqRef={wetMidEqRef}
          wetHighEqRef={wetHighEqRef}
          wetLpfRef={wetLpfRef}
          masterTelemetryRef={masterTelemetryRef}
          lastResumeStatusRef={lastResumeStatusRef}
          analyserLRef={analyserLRef}
          analyserRRef={analyserRRef}
          stereoTelemetryRef={stereoTelemetryRef}
          sourceQualityTelemetryRef={sourceQualityTelemetryRef}
          multibandStereoTelemetryRef={multibandStereoTelemetryRef}
          sourceQualityRef={sourceQualityRef}
          setEqGains={setEqGains}
          setStereoWidth={setStereoWidth}
          setBassEnhancer={setBassEnhancer}
          setBassIntensity={setBassIntensity}
          setSpatialMode={setSpatialMode}
          setReverbMix={setReverbMix}
          setHarmonicExciter={setHarmonicExciter}
          setEnableDeesser={setEnableDeesser}
          setEnableDeharsh={setEnableDeharsh}
          setEnableSaturation={setEnableSaturation}
          setSatDrive={setSatDrive}
          setSatMix={setSatMix}
          setSaturationOutputTrimDb={setSaturationOutputTrimDb}
          setSatMode={setSatMode}
          setEnableStereoDepth={setEnableStereoDepth}
          setStereoDepthAmount={setStereoDepthAmount}
          setEnable8D={setEnable8D}
          setEnableTransient={setEnableTransient}
          truePeakNodeRef={truePeakNodeRef}
          autoCalibProfile={autoCalibProfile}
          setAutoCalibProfile={setAutoCalibProfile}
        />
      )}
    </>
  );
}
