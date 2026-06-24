import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X, RefreshCw, Check } from 'lucide-react';
import { EQ_BANDS, EQ_PRESETS } from '../utils/equalizerConfig';

const SOUND_PRESETS_DATA = [
  { name: 'Som Limpo', desc: 'Quase transparente, só segurança/calibração.' },
  { name: 'Fone Relaxado', desc: 'Crossfeed alto, sem fadiga, som natural.' },
  { name: 'Cinema 8D', desc: 'Som rotacional ao redor da cabeça.' },
  { name: 'Concerto Ao Vivo', desc: 'Palco de rock com acustica de hall.' },
  { name: 'Estudio Limpo', desc: 'Seco e preciso, sem coloracao.' },
  { name: 'Catedral', desc: 'Reverb longo e grandioso.' },
  { name: 'Lo-Fi', desc: 'Morno e vintage, agudos cortados.' },
  { name: 'Bass Boost', desc: 'Sub-graves dominantes.' },
  { name: 'Voz Clara', desc: 'Presenca vocal destacada.' }
];

const SOUND_PRESETS = {
  'Som Limpo': {
    label: "Som Limpo",
    desc: "Quase transparente, só segurança/calibração.",
    eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    crossfeed: { active: false, gainDb: -12, delayMs: 0.25, lpfHz: 700 },
    deharsh: false,
    spatial: { active: false, wet: 0.0, motion: "Parado", speed: 0.5, radius: 2.0 },
    depth: 0.0,
    room: { preset: "Estúdio", material: "Madeira", wet: 0.0 },
    bass: { active: false, amount: 0.0 },
    saturation: { active: false, mode: "tube", drive: 0.0, mix: 0.0 },
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.5
  },
  'Fone Relaxado': {
    label: "Fone Relaxado",
    desc: "Crossfeed alto, sem fadiga, som natural.",
    crossfeed: { active: true, gainDb: -9, delayMs: 0.35, lpfHz: 750 },
    eq: [0, 0, 0, 0, 0, 0, 0, -1.0, -1.5, -2.0],
    deharsh: true,
    spatial: { active: false, wet: 0.0 },
    room: { preset: "Estúdio", material: "Tecido", wet: 0.0 },
    saturation: { active: true, mode: "tube", drive: 0.08, mix: 0.12 },
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.8
  },
  'Cinema 8D': {
    label: "Cinema 8D",
    desc: "Som rotacional ao redor da cabeça.",
    spatial: { active: true, wet: 0.30, motion: "Elipse", speed: 0.25, radius: 1.6 },
    depth: 0.55,
    room: { preset: "Cinema", material: "Tecido", wet: 0.10 },
    bass: { active: true, amount: 0.12 },
    eq: [4, 3, 1, -2, -3, 0, 1, 3, 4, 5],
    extraHeadroomDb: -2.0,
    maxMakeupDb: 1.0
  },
  'Concerto Ao Vivo': {
    label: "Concerto Ao Vivo",
    desc: "Palco de rock com acustica de hall.",
    room: { preset: "Concerto", material: "Madeira", wet: 0.14 },
    depth: 0.45,
    spatial: { active: true, wet: 0.16, motion: "Parado" },
    saturation: { active: true, mode: "tube", drive: 0.12, mix: 0.20 },
    eq: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
    extraHeadroomDb: -1.8,
    maxMakeupDb: 0.8
  },
  'Estudio Limpo': {
    label: "Estúdio Limpo",
    desc: "Seco e preciso, sem coloracao.",
    room: { preset: "Estúdio", material: "Tecido", wet: 0.04 },
    spatial: { active: false, wet: 0.0 },
    saturation: { active: false, drive: 0.0, mix: 0.0 },
    bass: { active: false, amount: 0.0 },
    eq: [2, 2, 1, 0, 0, 0, 1, 1, 2, 2],
    deharsh: true,
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.5
  },
  'Catedral': {
    label: "Catedral",
    desc: "Reverb longo e grandioso.",
    room: { preset: "Catedral", material: "Pedra", wet: 0.11, hpf: 220, lpf: 7000 },
    depth: 0.70,
    spatial: { active: true, wet: 0.18 },
    eq: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
    extraHeadroomDb: -2.5,
    maxMakeupDb: 0.8
  },
  'Lo-Fi': {
    label: "Lo-Fi",
    desc: "Morno e vintage, agudos cortados.",
    saturation: { active: true, mode: "tape", drive: 0.28, mix: 0.35 },
    eq: [1.0, 0, 0, 0, 0, 0, 0, -3.0, -5.0, -6.0],
    room: { preset: "Pequena", material: "Madeira", wet: 0.04 },
    stereoWidth: 0.80,
    extraHeadroomDb: -1.5,
    maxMakeupDb: 0.8
  },
  'Bass Boost': {
    label: "Bass Boost",
    desc: "Sub-graves dominantes.",
    bass: { active: true, amount: 0.35 },
    eq: [2.5, 2.0, 1.0, 0, 0, 0, 0, 0, 0, 0],
    subMono: true,
    lowSideGain: 0.0,
    saturation: { active: true, mode: "transformer", drive: 0.12, mix: 0.18 },
    extraHeadroomDb: -2.5,
    maxMakeupDb: 0.5
  },
  'Voz Clara': {
    label: "Voz Clara",
    desc: "Presenca vocal destacada.",
    eq: [0, 0, 0, 0, 0, +1.0, +1.2, +0.6, 0, 0],
    deesser: true,
    deharsh: true,
    room: { preset: "Estúdio", wet: 0.03 },
    spatial: { active: false, wet: 0.0 },
    saturation: { active: true, mode: "tube", drive: 0.10, mix: 0.15 },
    extraHeadroomDb: -1.0,
    maxMakeupDb: 0.8
  }
};

const AMBIENTES_PADRAO = ['Pequena', 'Club', 'Concerto', 'Catedral', 'Estádio', 'Vastidão'];
const AMBIENTES_IR = ['Geleira', 'Praia', 'Tubo', 'Squash', 'Túnel', 'Concreto', 'Tanque', 'Masmorra'];
const MATERIAIS = ['Madeira', 'Concreto', 'Vidro', 'Tecido', 'Pedra', 'Metal', 'Carpete'];
const GENEROS = ['Rock', 'Jazz', 'Ambient', 'Orchestral', 'EDM'];
const MOTION_MODES = ['Parado', 'Elipse', 'Figura 8', 'Espiral', 'Vertical', 'Caos', 'Reativo'];

function computeAutoEqCurveMaxBoostDb(filters) {
  try {
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);
    const fftSize = 512;
    const freqs = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i++) {
      const t = i / (fftSize - 1);
      freqs[i] = 20 * Math.pow(1000, t);
    }

    const totalMag = new Float32Array(fftSize).fill(1);
    for (const f of filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.value = f.freq;
      if (f.gainDb !== undefined) bq.gain.value = f.gainDb;
      if (f.Q !== undefined) bq.Q.value = f.Q;
      
      const mag = new Float32Array(fftSize);
      const phase = new Float32Array(fftSize);
      bq.getFrequencyResponse(freqs, mag, phase);
      
      for (let i = 0; i < fftSize; i++) {
        totalMag[i] *= Math.max(mag[i], 1e-9);
      }
    }

    let maxBoostDb = -999;
    for (let i = 0; i < fftSize; i++) {
      const db = 20 * Math.log10(Math.max(totalMag[i], 1e-9));
      if (db > maxBoostDb) maxBoostDb = db;
    }
    return Math.max(0, maxBoostDb);
  } catch {
    return Math.max(0, ...filters.map(f => f.gainDb));
  }
}

function sanitizeHeadphoneProfile(profile) {
  const allowed = ["peaking", "lowshelf", "highshelf", "lowpass", "highpass"];
  const filters = (profile.filters || [])
    .filter(f => Number.isFinite(f.freq))
    .map(f => ({
      type: allowed.includes(f.type) ? f.type : "peaking",
      freq: Math.max(20, Math.min(20000, f.freq)),
      gainDb: Math.max(-12, Math.min(6, f.gainDb ?? 0)),
      Q: Math.max(0.1, Math.min(8, f.Q ?? 1))
    }))
    .slice(0, 12);
    
  const maxBoostDb = computeAutoEqCurveMaxBoostDb(filters);
  const safePreampDb = Math.min(profile.preampDb ?? 0, -(maxBoostDb + 0.7));
  
  return {
    ...profile,
    filters,
    maxBoostDb,
    preampDb: safePreampDb,
    safety: profile.preampDb <= safePreampDb ? "OK" : "ADJUSTED"
  };
}

function parseAutoEqTxt(text, meta = {}) {
  const lines = text.split(/\r?\n/);
  let preampDb = 0;
  const filters = [];
  for (const line of lines) {
    const preampMatch = line.match(/Preamp:\s*([-+]?\d+(\.\d+)?)\s*dB/i);
    if (preampMatch) {
      preampDb = parseFloat(preampMatch[1]);
      continue;
    }
    const filterMatch = line.match(
      /Filter\s+\d+:\s+ON\s+(\w+)\s+Fc\s+([-+]?\d+(\.\d+)?)\s+Hz\s+Gain\s+([-+]?\d+(\.\d+)?)\s+dB\s+Q\s+([-+]?\d+(\.\d+)?)/i
    );
    if (filterMatch) {
      const autoEqType = filterMatch[1].toUpperCase();
      const typeMap = {
        PK: "peaking",
        LS: "lowshelf",
        HS: "highshelf",
        LP: "lowpass",
        HP: "highpass"
      };
      filters.push({
        type: typeMap[autoEqType] ?? "peaking",
        freq: Number(filterMatch[2]),
        gainDb: Number(filterMatch[4]),
        Q: Number(filterMatch[6])
      });
    }
  }
  return sanitizeHeadphoneProfile({
    id: meta.id ?? "custom-profile",
    name: meta.name ?? "Custom AutoEQ Profile",
    brand: meta.brand ?? "Unknown",
    type: meta.type ?? "Unknown",
    source: "AutoEQ TXT",
    target: meta.target ?? "Unknown",
    preampDb,
    filters
  });
}

function M3Chip({ label, selected, onClick, disabled, icon: Icon, checkIcon = true, color = 'primary' }) {
  const activeClasses = {
    primary: 'bg-primary/20 border-primary text-primary shadow-sm shadow-primary/5 hover:bg-primary/30',
    tertiary: 'bg-tertiary/20 border-tertiary text-tertiary shadow-sm shadow-tertiary/5 hover:bg-tertiary/30',
    error: 'bg-error/20 border-error text-error shadow-sm shadow-error/5 hover:bg-error/30'
  }[color] || 'bg-primary/20 border-primary text-primary shadow-sm shadow-primary/5 hover:bg-primary/30';

  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
        selected
          ? activeClasses
          : 'bg-surface-container-high/40 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {selected && checkIcon && <Check size={11} className="stroke-[3]" />}
      {Icon && <Icon size={11} />}
      <span>{label}</span>
    </motion.button>
  );
}

export function EqualizerModal({ 
  isOpen, onClose, gains, setGains, preset, setPreset, 
  playbackRate, setPlaybackRate, preservesPitch, setPreservesPitch, reverbMix, setReverbMix,
  enableTransient, setEnableTransient,
  enableAdaptiveEq, setEnableAdaptiveEq, enableDeesser, setEnableDeesser, enableDeharsh, setEnableDeharsh,
  enableSaturation, setEnableSaturation, setSatDrive, setSatMode,
  enableSubmono, setEnableSubmono, setEnableCrossfeed, crossfeedAmount, setCrossfeedAmount,
  
  enable8D, setEnable8D,
  motionMode, setMotionMode,
  motionSpeed, setMotionSpeed,
  motionRadius, setMotionRadius,
  stereoWidth, setStereoWidth,
  bassEnhancer, setBassEnhancer,
  bassIntensity, setBassIntensity,
  roomMorphing, setRoomMorphing,
  lufsMode, setLufsMode,
  spatialMode, setSpatialMode,
  roomMaterial, setRoomMaterial,
  genreProfile, setGenreProfile,
  harmonicExciter, setHarmonicExciter,
  enablePhaseRotation, setEnablePhaseRotation,
  enableStereoDepth, setEnableStereoDepth,
  stereoDepthAmount, setStereoDepthAmount,
  enableReplayGain, setEnableReplayGain,
  
  autoEqProfile, setAutoEqProfile,
  autoEqAmount, setAutoEqAmount,
  
  abMode, setAbMode,
  abBlend, setAbBlend,
  
  presetIntensity, setPresetIntensity,
  setPresetHeadroomConfig, onPresetApplied
}) {
  const [activeTab, setActiveTab] = useState('eq');

  if (!isOpen) return null;

  const handleGainChange = (index, value) => {
    const newGains = [...gains];
    newGains[index] = parseFloat(value);
    if(setGains) setGains(newGains);
    if(setPreset) setPreset('Custom');
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      if (setAutoEqProfile) {
        setAutoEqProfile(parseAutoEqTxt(text, { name: file.name.replace('.txt', ''), id: file.name }));
      }
    };
    reader.readAsText(file);
  };

  const applyPreset = (presetName, intensity = presetIntensity) => {
    const config = SOUND_PRESETS[presetName];
    if (!config) {
      // Fallback for standard EQ presets
      if (EQ_PRESETS[presetName]) {
        if (setGains) setGains(EQ_PRESETS[presetName]);
        if (setPreset) setPreset(presetName);
      }
      return;
    }

    if (setPreset) setPreset(presetName);

    // Apply EQ scaled by intensity
    if (config.eq && setGains) {
      const scaledGains = config.eq.map(g => g * intensity);
      setGains(scaledGains);
    }

    // Apply Crossfeed scaled by intensity
    if (setEnableCrossfeed) setEnableCrossfeed(!!config.crossfeed?.active);
    if (config.crossfeed?.active) {
      if (setCrossfeedAmount) {
        setCrossfeedAmount(Math.min(1.0, 0.7 * intensity));
      }
    }

    // Apply Spatial 8D / Stereo Width / Stereo Depth
    if (setEnable8D) setEnable8D(!!config.spatial?.active);
    if (config.spatial?.active) {
      if (setMotionMode) setMotionMode(config.spatial.motion || 'Parado');
      if (setMotionSpeed) setMotionSpeed((config.spatial.speed || 0.5) * intensity);
      if (setMotionRadius) setMotionRadius((config.spatial.radius || 2.0) * intensity);
    } else {
      if (setMotionMode) setMotionMode('Parado');
    }

    if (setEnableStereoDepth) setEnableStereoDepth(config.depth > 0);
    if (config.depth !== undefined && setStereoDepthAmount) {
      setStereoDepthAmount(config.depth * intensity);
    }

    if (config.stereoWidth !== undefined) {
      if (setStereoWidth) {
        const wVal = config.stereoWidth;
        if (wVal <= 0.8) setStereoWidth('Estreito');
        else if (wVal >= 1.4) setStereoWidth('Ultra');
        else if (wVal >= 1.1) setStereoWidth('Largo');
        else setStereoWidth('Natural');
      }
    } else {
      if (setStereoWidth) setStereoWidth('Natural');
    }

    // Apply Reverb / Room
    if (config.room) {
      if (setReverbMix) setReverbMix(config.room.wet * intensity);
      if (setSpatialMode) setSpatialMode(config.room.preset);
      if (setRoomMaterial) setRoomMaterial(config.room.material || 'Madeira');
    } else {
      if (setReverbMix) setReverbMix(0.0);
    }

    // Apply Bass / SubMono
    if (setBassEnhancer) setBassEnhancer(!!config.bass?.active);
    if (config.bass?.active && setBassIntensity) {
      setBassIntensity(Math.min(100, Math.round(50 + (config.bass.amount * 100) * intensity)));
    }
    if (setEnableSubmono) setEnableSubmono(!!config.subMono);

    // Apply Saturation
    if (setEnableSaturation) setEnableSaturation(!!config.saturation?.active);
    if (config.saturation?.active) {
      if (setSatMode) setSatMode(config.saturation.mode || 'tube');
      if (setSatDrive) setSatDrive(config.saturation.drive * intensity);
    }

    // Apply Deharsh / Deesser
    if (setEnableDeharsh) setEnableDeharsh(!!config.deharsh);
    if (setEnableDeesser) setEnableDeesser(!!config.deesser);

    // Headroom config & Telemetry
    if (setPresetHeadroomConfig) {
      setPresetHeadroomConfig({
        extraHeadroomDb: config.extraHeadroomDb || 0,
        maxMakeupDb: config.maxMakeupDb || 0,
        intensity
      });
    }

    if (onPresetApplied) {
      onPresetApplied(presetName, intensity, config);
    }
  };

  const formatHz = (freq) => {
    if (freq >= 1000) return `${freq / 1000}k`;
    return freq;
  };

  const getExciterLevel = () => {
    const map = { off: 'Off', subtle: 'Sutil', medium: 'Medio', strong: 'Forte' };
    return map[harmonicExciter] || 'Off';
  };

  const setExciterLevel = (level) => {
    const map = { 'Off': 'off', 'Sutil': 'subtle', 'Medio': 'medium', 'Forte': 'strong' };
    if (setHarmonicExciter) {
      setHarmonicExciter(map[level] || 'off');
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[300] p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-[var(--md-sys-color-surface-container-high)] border border-[var(--md-sys-color-outline-variant)]/20 rounded-[28px] shadow-2xl w-full max-w-[820px] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-6 flex justify-between items-center border-b border-[var(--md-sys-color-outline-variant)]/10">
            <div className="flex items-center space-x-4">
              <SlidersHorizontal size={24} className="text-[var(--md-sys-color-primary)]" />
              <div>
                <h2 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">Estúdio de Áudio</h2>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">Equalizador & Efeitos (FX)</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]">
              <X size={24} />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex bg-[var(--md-sys-color-surface-container-low)]/50 border-b border-[var(--md-sys-color-outline-variant)]/10">
            <button onClick={() => setActiveTab('eq')} className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'eq' ? 'text-[var(--md-sys-color-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]/20'}`}>
              Equalizador
              {activeTab === 'eq' && (
                <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--md-sys-color-primary)] rounded-full" />
              )}
            </button>
            <button onClick={() => setActiveTab('fx')} className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'fx' ? 'text-[var(--md-sys-color-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]/20'}`}>
              Efeitos (FX)
              {activeTab === 'fx' && (
                <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--md-sys-color-primary)] rounded-full" />
              )}
            </button>
            <button onClick={() => setActiveTab('espacial')} className={`flex-1 py-4 text-sm font-bold transition-all relative ${activeTab === 'espacial' ? 'text-[var(--md-sys-color-primary)]' : 'text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-variant)]/20'}`}>
              Espacial
              {activeTab === 'espacial' && (
                <motion.div layoutId="activeTabIndicator" className="absolute bottom-0 left-4 right-4 h-0.5 bg-[var(--md-sys-color-primary)] rounded-full" />
              )}
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-8 h-[550px] overflow-y-auto custom-scrollbar">
            
            {activeTab === 'eq' && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="space-y-8">
                
                {/* Sound Presets */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-[var(--md-sys-color-on-surface)] font-bold">
                      <div className="w-4 h-4 grid grid-cols-2 gap-[2px]">
                        <div className="bg-[var(--md-sys-color-primary)] rounded-sm"></div><div className="bg-[var(--md-sys-color-primary)] rounded-sm"></div>
                        <div className="bg-[var(--md-sys-color-primary)] rounded-sm"></div><div className="bg-[var(--md-sys-color-primary)] rounded-sm"></div>
                      </div>
                      <span>Sound Presets</span>
                    </div>
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">Configura toda a chain de uma vez</span>
                  </div>

                  {/* Intensidade do Preset */}
                  <div className="mb-6 p-4 bg-[var(--md-sys-color-surface-container-low)] rounded-[20px] border border-[var(--md-sys-color-outline-variant)]/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)] block">Intensidade do Preset</span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] block">Modifica o ganho efetivo de todos os efeitos do preset</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Leve (60%)', value: 0.6 },
                        { label: 'Normal', value: 1.0 },
                        { label: 'Forte (130%)', value: 1.3 }
                      ].map((item) => (
                        <M3Chip
                          key={item.value}
                          label={item.label}
                          selected={presetIntensity === item.value}
                          onClick={() => {
                            if (setPresetIntensity) setPresetIntensity(item.value);
                            if (preset && SOUND_PRESETS[preset]) {
                              applyPreset(preset, item.value);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SOUND_PRESETS_DATA.map((p) => (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p.name)}
                        className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden ${
                          preset === p.name 
                            ? 'bg-[var(--md-sys-color-primary-container)] border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary-container)] shadow-lg shadow-[var(--md-sys-color-primary)]/10' 
                            : 'bg-[var(--md-sys-color-surface-container-lowest)]/50 border-[var(--md-sys-color-outline-variant)]/30 text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80 hover:border-[var(--md-sys-color-outline)]'
                        }`}
                      >
                        <span className="font-bold block mb-1">{p.name}</span>
                        <span className="text-xs opacity-75 block">{p.desc}</span>
                        {preset === p.name && (
                          <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-[var(--md-sys-color-primary)] animate-pulse" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* AutoEQ / Correção de Fone */}
                <div className="border border-[var(--md-sys-color-primary)]/30 bg-[var(--md-sys-color-primary-container)]/10 rounded-[24px] p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[var(--md-sys-color-primary)]"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>
                        <span>Calibração de Fone (AutoEQ)</span>
                      </h3>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">Nivela a resposta de frequência do seu hardware.</p>
                    </div>
                    {autoEqProfile && (
                      <button onClick={() => setAutoEqProfile(null)} className="text-xs text-[var(--md-sys-color-error)] font-bold px-3 py-1 bg-[var(--md-sys-color-error)]/10 rounded-full hover:bg-[var(--md-sys-color-error)]/20 transition-colors">Remover Perfil</button>
                    )}
                  </div>

                  {!autoEqProfile ? (
                    <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-[var(--md-sys-color-outline-variant)]/30 rounded-xl bg-[var(--md-sys-color-surface-container-lowest)]/50">
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4 text-center">Importe um preset do AutoEQ (.txt)<br/>para corrigir seu fone de ouvido.</p>
                      <label className="cursor-pointer px-6 py-2 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-full text-xs font-bold hover:shadow-lg transition-all">
                        Carregar Preset
                        <input type="file" accept=".txt" onChange={handleFileUpload} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="p-4 bg-[var(--md-sys-color-surface-container-low)] rounded-xl border border-[var(--md-sys-color-outline-variant)]/20">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] uppercase font-bold tracking-wider">Modelo Ativo</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${autoEqProfile.safety === 'OK' ? 'bg-[#4ade80]/20 text-[#4ade80]' : 'bg-[#facc15]/20 text-[#facc15]'}`}>{autoEqProfile.safety}</span>
                        </div>
                        <div className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{autoEqProfile.name}</div>
                        <div className="flex space-x-4 mt-3 text-[10px] font-mono text-[var(--md-sys-color-on-surface-variant)]">
                          <div>Filtros: <span className="text-[var(--md-sys-color-primary)] font-bold">{autoEqProfile.filters.length}</span></div>
                          <div>Preamp: <span className="text-[var(--md-sys-color-primary)] font-bold">{autoEqProfile.preampDb.toFixed(1)}dB</span></div>
                          <div>Boost Max: <span className="text-[var(--md-sys-color-primary)] font-bold">+{autoEqProfile.maxBoostDb.toFixed(1)}dB</span></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-4">
                          <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">Intensidade da Correção</label>
                          <span className="text-xs font-mono text-[var(--md-sys-color-primary)] font-bold">{Math.round((autoEqAmount || 0) * 100)}%</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {[ {label: 'Leve', val: 0.5}, {label: 'Natural', val: 0.75}, {label: 'Completa', val: 1.0} ].map(amt => (
                            <M3Chip
                              key={amt.label}
                              label={amt.label}
                              selected={autoEqAmount === amt.val}
                              onClick={() => setAutoEqAmount && setAutoEqAmount(amt.val)}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Legacy EQ Band Sliders */}
                <div className="mt-12">
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4">Ajuste Fino do Equalizador</h3>
                  <div className="flex justify-between items-end space-x-2 pt-4">
                    {EQ_BANDS.map((freq, index) => (
                      <div key={freq} className="flex flex-col items-center space-y-4 flex-1">
                        <div className="text-xs font-mono text-[var(--md-sys-color-primary)] w-8 text-center h-4 font-bold">
                          {(gains && gains[index]) > 0 ? '+' : ''}{(gains && gains[index]) || 0}
                        </div>
                        <div className="relative h-32 w-full flex justify-center py-2 bg-[var(--md-sys-color-surface-container-lowest)]/30 rounded-xl border border-[var(--md-sys-color-outline-variant)]/10">
                          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-white/5 rounded" />
                          <input
                            type="range" min="-12" max="12" step="0.1" value={(gains && gains[index]) || 0} onChange={(e) => handleGainChange(index, e.target.value)}
                            className="absolute top-1/2 left-1/2 studio-slider-vertical studio-fader cursor-pointer"
                          />
                        </div>
                        <div className="text-[10px] font-bold text-[var(--md-sys-color-on-surface-variant)] pt-2">{formatHz(freq)}</div>
                      </div>
                    ))}
                  </div>
                </div>

              </motion.div>
            )}

            {activeTab === 'fx' && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="space-y-8">
                
                {/* A/B Comparator */}
                <div className="border border-[var(--md-sys-color-tertiary)]/30 bg-[var(--md-sys-color-tertiary-container)]/10 rounded-[24px] p-6 mb-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] flex items-center space-x-2">
                        <RefreshCw size={18} className="text-[var(--md-sys-color-tertiary)]" />
                        <span>A/B Comparator</span>
                      </h3>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-1">Compare o áudio processado com a referência calibrada.</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 mb-6">
                    {[
                      { id: 'RAW', label: 'Raw' },
                      { id: 'CALIBRATED', label: 'Ref (Calibrada)' },
                      { id: 'PROCESSED', label: 'Mix (DSP)' }
                    ].map(mode => (
                      <M3Chip
                        key={mode.id}
                        label={mode.label}
                        selected={abMode === mode.id}
                        onClick={() => setAbMode && setAbMode(mode.id)}
                        color="tertiary"
                      />
                    ))}
                  </div>

                  {abMode === 'PROCESSED' && (
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">A/B Blend (Crossfade)</label>
                        <span className="text-xs font-mono text-[var(--md-sys-color-tertiary)] font-bold">{abBlend === 0 ? 'A (Referência)' : abBlend === 1 ? 'B (DSP)' : `${Math.round(abBlend * 100)}% B`}</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.01"
                        value={abBlend === undefined ? 1.0 : abBlend} onChange={(e) => setAbBlend && setAbBlend(parseFloat(e.target.value))}
                        className="w-full studio-fader cursor-pointer"
                        style={{ '--fader-color': 'var(--md-sys-color-tertiary)' }}
                      />
                    </div>
                  )}
                </div>
                
                {/* Presets Rápidos */}
                <div>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4">Efeitos Rápidos</h3>
                  <div className="flex flex-wrap gap-2">
                    <M3Chip
                      label="Nightcore"
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(1.25); if(setPreservesPitch) setPreservesPitch(false); if(setReverbMix) setReverbMix(0.0); }}
                      selected={playbackRate === 1.25 && !preservesPitch}
                    />
                    <M3Chip
                      label="Slowed + Reverb"
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(0.85); if(setPreservesPitch) setPreservesPitch(false); if(setReverbMix) setReverbMix(0.5); }}
                      selected={playbackRate === 0.85 && !preservesPitch && reverbMix === 0.5}
                    />
                    <M3Chip
                      label="Resetar"
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(1.0); if(setPreservesPitch) setPreservesPitch(true); if(setReverbMix) setReverbMix(0.0); }}
                      selected={playbackRate === 1.0 && preservesPitch && reverbMix === 0.0}
                      color="tertiary"
                    />
                  </div>
                </div>

                <div className="space-y-6 mt-8">
                  {/* Velocidade */}
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">Velocidade (Speed)</label>
                      <span className="text-sm font-mono text-[var(--md-sys-color-primary)] font-bold">{playbackRate ? playbackRate.toFixed(2) : '1.00'}x</span>
                    </div>
                    <input
                      type="range" min="0.5" max="2.0" step="0.05"
                      value={playbackRate || 1} onChange={(e) => setPlaybackRate && setPlaybackRate(parseFloat(e.target.value))}
                      className="w-full studio-fader cursor-pointer"
                    />
                  </div>

                  {/* Reverb */}
                  <div className="space-y-4 mt-6">
                    <div className="flex justify-between">
                      <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">Eco / Reverb</label>
                      <span className="text-sm font-mono text-[var(--md-sys-color-primary)] font-bold">{Math.round((reverbMix || 0) * 100)}%</span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={reverbMix || 0} onChange={(e) => setReverbMix && setReverbMix(parseFloat(e.target.value))}
                      className="w-full studio-fader cursor-pointer"
                    />
                  </div>
                </div>

                {/* ENHANCEMENT STACK */}
                <div className="mt-8 border border-[var(--md-sys-color-outline-variant)]/25 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-6 relative">
                  <div className="absolute -top-3 left-6 bg-[var(--md-sys-color-surface-container-high)] px-2 text-xs font-bold text-[var(--md-sys-color-primary)] uppercase tracking-wider">
                    ENHANCEMENT STACK
                  </div>

                  <div className="space-y-8 mt-2">
                    {/* Crossfeed Slider */}
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">Crossfeed (Vazamento)</label>
                        <span className="text-sm font-mono text-[var(--md-sys-color-primary)] font-bold">{Math.round((crossfeedAmount || 0) * 100)}%</span>
                      </div>
                      <input
                        type="range" min="0" max="1.0" step="0.1" value={crossfeedAmount || 0} onChange={(e) => {if(setCrossfeedAmount) setCrossfeedAmount(parseFloat(e.target.value)); if(setEnableCrossfeed) setEnableCrossfeed(parseFloat(e.target.value) > 0);}}
                        className="w-full studio-fader cursor-pointer"
                      />
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Simula vazamento natural entre os ouvidos. Reduz fadiga.</p>
                    </div>

                    {/* Largura Estereo */}
                    <div>
                      <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4 block">Largura Estereo</label>
                      <div className="flex flex-wrap gap-2">
                        {['Estreito', 'Natural', 'Largo', 'Ultra'].map(w => (
                          <M3Chip
                            key={w}
                            label={w}
                            selected={w === stereoWidth}
                            onClick={() => setStereoWidth(w)}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Harmonic Exciter */}
                    <div>
                      <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4 block">Harmonic Exciter</label>
                      <div className="flex flex-wrap gap-2">
                        {['Off', 'Sutil', 'Medio', 'Forte'].map(w => (
                          <M3Chip
                            key={w}
                            label={w}
                            selected={w === getExciterLevel()}
                            onClick={() => setExciterLevel(w)}
                          />
                        ))}
                      </div>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-2">Adiciona harmonicos sutis. Melhora brilho em MP3.</p>
                    </div>

                    {/* Normalizacao LUFS (ReplayGain) */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Loudness Leveling (ReplayGain)</label>
                        <div className="flex items-center space-x-2">
                           <span className="text-[10px] uppercase font-bold text-[var(--md-sys-color-on-surface-variant)]">{enableReplayGain ? 'ON' : 'OFF'}</span>
                           <button 
                             onClick={() => setEnableReplayGain && setEnableReplayGain(!enableReplayGain)}
                             className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enableReplayGain ? 'bg-[var(--md-sys-color-primary)]' : 'bg-[var(--md-sys-color-surface-container-highest)]'}`}
                           >
                             <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${enableReplayGain ? 'translate-x-5' : 'translate-x-1'}`} />
                           </button>
                        </div>
                      </div>
                      
                      {enableReplayGain && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {[
                            {name: 'Seguro', lufs: '-18 LUFS'}, {name: 'Normal', lufs: '-16 LUFS'},
                            {name: 'Alto', lufs: '-14 LUFS'}, {name: 'Noite', lufs: '-20 LUFS'}
                          ].map(w => (
                            <M3Chip
                              key={w.name}
                              label={`${w.name} (${w.lufs})`}
                              selected={w.name === lufsMode}
                              onClick={() => setLufsMode(w.name)}
                            />
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mt-2">Nivela o volume das faixas para evitar picos inesperados.</p>
                    </div>
                  </div>
                </div>
                <div className="mt-8 border border-[var(--md-sys-color-outline-variant)]/25 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-6 relative">
                  <div className="absolute top-4 right-4 text-[var(--md-sys-color-tertiary)] opacity-40">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
                  </div>
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-tertiary)] tracking-wider mb-1">PROCESSAMENTO AVANÇADO (ALTO CUSTO CPU)</h3>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-6">Esses módulos usam AudioWorklets dedicados e rodam amostra por amostra em tempo real.</p>

                  <div className="space-y-6">
                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableTransient} onChange={(e) => setEnableTransient && setEnableTransient(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableTransient ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableTransient && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Transient Shaper</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Realça o ataque de batidas (kick/snare)</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableAdaptiveEq} onChange={(e) => setEnableAdaptiveEq && setEnableAdaptiveEq(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableAdaptiveEq ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableAdaptiveEq && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Adaptive EQ (Auto-balance)</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Nivela graves e agudos continuamente</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableDeesser} onChange={(e) => setEnableDeesser && setEnableDeesser(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableDeesser ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableDeesser && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">De-Esser Dinâmico</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Atenua a sibilância vocálica excessiva (6kHz)</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableDeharsh} onChange={(e) => setEnableDeharsh && setEnableDeharsh(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableDeharsh ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableDeharsh && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">De-Harshing Dinâmico</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Atenua asperezas agudas excessivas (3kHz-8kHz)</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableSubmono} onChange={(e) => setEnableSubmono && setEnableSubmono(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableSubmono ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableSubmono && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Sub Bass em Mono & Recovery</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Funde graves abaixo de 80Hz em mono e recupera harmônicos psicoacústicos</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enableSaturation} onChange={(e) => setEnableSaturation && setEnableSaturation(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enableSaturation ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableSaturation && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Saturação Analógica (Warmth)</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Simula o calor e compressão de fita/válvula analógica</span>
                      </div>
                    </label>

                    <label className="flex items-center space-x-4 cursor-pointer">
                      <div className="relative flex items-center">
                        <input type="checkbox" className="sr-only peer" checked={enablePhaseRotation} onChange={(e) => setEnablePhaseRotation && setEnablePhaseRotation(e.target.checked)} />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${enablePhaseRotation ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enablePhaseRotation && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Rotação de Fase (Preservar Headroom)</span>
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Dispersa a fase de transientes para ganhar headroom e loudness limpo antes do Limiter</span>
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mt-6 border border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-6">
                  <label className="flex items-center space-x-4 cursor-pointer">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="sr-only peer" checked={!preservesPitch} onChange={(e) => setPreservesPitch && setPreservesPitch(!e.target.checked)} />
                      <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${!preservesPitch ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {!preservesPitch && <div className="w-2 h-2 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Mudar Voz junto com a Velocidade</span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Necessário para efeitos como Nightcore e Slowed.</span>
                    </div>
                  </label>
                </div>
              </motion.div>
            )}

            {activeTab === 'espacial' && (
              <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}} className="space-y-8">
                
                <div className="border border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-6">
                  <label className="flex items-center space-x-4 cursor-pointer">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="sr-only peer" checked={enable8D} onChange={(e) => setEnable8D(e.target.checked)} />
                      <div className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${enable8D ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enable8D && <div className="w-3 h-3 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Audio Espacial 8D (Binaural)</span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Ambisonics em tempo real. Use fones de ouvido.</span>
                    </div>
                  </label>
                </div>

                <div className="border border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-6 space-y-4">
                  <label className="flex items-center space-x-4 cursor-pointer">
                    <div className="relative flex items-center">
                      <input type="checkbox" className="sr-only peer" checked={enableStereoDepth} onChange={(e) => setEnableStereoDepth && setEnableStereoDepth(e.target.checked)} />
                      <div className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${enableStereoDepth ? 'bg-[var(--md-sys-color-primary)] border-[var(--md-sys-color-primary)]' : 'border-[var(--md-sys-color-outline)]'}`}>
                           {enableStereoDepth && <div className="w-3 h-3 rounded-full bg-[var(--md-sys-color-on-primary)]"></div>}
                      </div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Profundidade Estéreo (Near/Far)</span>
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Aplica filtros de absorção do ar, pre-delay lateral e suavização de transientes</span>
                    </div>
                  </label>
                  
                  {enableStereoDepth && (
                    <div className="space-y-4 pt-2">
                      <div className="flex justify-between">
                        <label className="text-xs text-[var(--md-sys-color-on-surface)]">Profundidade do Som</label>
                        <span className="text-xs font-mono text-[var(--md-sys-color-primary)] font-bold">{Math.round(stereoDepthAmount * 100)}%</span>
                      </div>
                      <input
                        type="range" min="0" max="1" step="0.05"
                        value={stereoDepthAmount} onChange={(e) => setStereoDepthAmount && setStereoDepthAmount(parseFloat(e.target.value))}
                        className="w-full studio-fader cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-4">AMBIENTES PADRÃO</h3>
                    <div className="flex flex-wrap gap-2">
                      {AMBIENTES_PADRAO.map((amb) => (
                        <M3Chip
                          key={amb}
                          label={amb}
                          selected={amb === spatialMode}
                          onClick={() => setSpatialMode && setSpatialMode(amb)}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-2">IR SPACES / EXPERIMENTAL</h3>
                    <p className="text-[10px] text-[var(--md-sys-color-error)] mb-3 opacity-80 font-bold">Aviso: Modo experimental. Estes ambientes possuem assinaturas acústicas extremas.</p>
                    <div className="flex flex-wrap gap-2">
                      {AMBIENTES_IR.map((amb) => (
                        <M3Chip
                          key={amb}
                          label={amb}
                          selected={amb === spatialMode}
                          onClick={() => setSpatialMode && setSpatialMode(amb)}
                          color="error"
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-4">MATERIAL ACÚSTICO</h3>
                  <div className="flex flex-wrap gap-2">
                    {MATERIAIS.map((mat) => (
                      <M3Chip
                        key={mat}
                        label={mat}
                        selected={mat === roomMaterial}
                        onClick={() => setRoomMaterial && setRoomMaterial(mat)}
                      />
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-b border-[var(--md-sys-color-outline-variant)]/10 pb-8">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-1">PERFIL POR GENERO</h3>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-4">Configura EQ + espacial para o gênero da música.</p>
                  <div className="flex flex-wrap gap-2">
                    {GENEROS.map((gen) => (
                      <M3Chip
                        key={gen}
                        label={gen}
                        selected={gen === genreProfile}
                        onClick={() => setGenreProfile && setGenreProfile(gen)}
                      />
                    ))}
                  </div>
                </div>

                {/* MOTION SYSTEM */}
                <div className="pt-2 space-y-6">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-1">MOTION SYSTEM</h3>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-4">Move o som em trajetórias ao redor da cabeça. Requer Áudio Espacial ativo.</p>
                  
                  <div className="flex flex-wrap gap-2">
                    {MOTION_MODES.map((mode) => (
                      <M3Chip
                        key={mode}
                        label={mode}
                        selected={mode === motionMode}
                        onClick={() => setMotionMode && setMotionMode(mode)}
                      />
                    ))}
                  </div>

                  {motionMode !== 'Parado' && (
                    <div className="space-y-6 mt-6 bg-[var(--md-sys-color-surface-container-lowest)]/50 border border-[var(--md-sys-color-outline-variant)]/15 p-6 rounded-[24px]">
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <label className="text-xs text-[var(--md-sys-color-on-surface)]">Velocidade</label>
                          <span className="text-xs font-mono text-[var(--md-sys-color-primary)] font-bold">{motionSpeed.toFixed(1)}x</span>
                        </div>
                        <input
                          type="range" min="0.1" max="5.0" step="0.1" value={motionSpeed} onChange={(e) => setMotionSpeed(parseFloat(e.target.value))}
                          className="w-full studio-fader cursor-pointer"
                        />
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <label className="text-xs text-[var(--md-sys-color-on-surface)]">Raio</label>
                          <span className="text-xs font-mono text-[var(--md-sys-color-primary)] font-bold">{motionRadius.toFixed(1)}m</span>
                        </div>
                        <input
                          type="range" min="0.1" max="10.0" step="0.1" value={motionRadius} onChange={(e) => setMotionRadius(parseFloat(e.target.value))}
                          className="w-full studio-fader cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Bass Enhancer Psicoac. */}
                <div className="pt-6 border-t border-[var(--md-sys-color-outline-variant)]/10 space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-1">Bass Enhancer Psicoacústico</h3>
                      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">Gera harmônicos psicoacústicos para fones perceberem sub-graves.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={bassEnhancer} onChange={(e) => setBassEnhancer(e.target.checked)} />
                      <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--md-sys-color-primary)]"></div>
                    </label>
                  </div>
                  
                  {bassEnhancer && (
                    <div className="space-y-4">
                      <div className="flex justify-between">
                        <label className="text-xs text-[var(--md-sys-color-on-surface)]">Intensidade</label>
                        <span className="text-xs font-mono text-[var(--md-sys-color-primary)] font-bold">{bassIntensity}%</span>
                      </div>
                      <input
                        type="range" min="0" max="100" step="1" value={bassIntensity} onChange={(e) => setBassIntensity(parseInt(e.target.value))}
                        className="w-full studio-fader cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Dynamic Room Morphing */}
                <div className="mt-6 border border-[var(--md-sys-color-outline-variant)]/20 bg-[var(--md-sys-color-surface-container-lowest)]/20 rounded-[24px] p-4 flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] block">Dynamic Room Morphing</span>
                    <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">A sala se adapta dinamicamente com base na energia da música.</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={roomMorphing} onChange={(e) => setRoomMorphing(e.target.checked)} />
                    <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--md-sys-color-primary)]"></div>
                  </label>
                </div>

              </motion.div>
            )}

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
