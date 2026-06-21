import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlidersHorizontal, X, RefreshCw } from 'lucide-react';
import { t } from '../i18n';

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS = {
  'Normal': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Rock': [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
  'Pop': [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  'Vocal': [-2, -2, 0, 2, 4, 4, 3, 1, 0, -2],
  'Electronic': [4, 3, 1, -2, -3, 0, 1, 3, 4, 5],
  'Acoustic': [2, 2, 1, 0, 0, 0, 1, 1, 2, 2]
};

const SOUND_PRESETS_DATA = [
  { name: 'Fone Relaxado', desc: 'Crossfeed alto, sem fadiga, som natural.', key: 'Normal' },
  { name: 'Cinema 8D', desc: 'Som rotacional ao redor da cabeça.', key: 'Electronic' },
  { name: 'Concerto Ao Vivo', desc: 'Palco de rock com acustica de hall.', key: 'Rock' },
  { name: 'Estudio Limpo', desc: 'Seco e preciso, sem coloracao.', key: 'Acoustic' },
  { name: 'Catedral', desc: 'Reverb longo e grandioso.', key: 'Pop' },
  { name: 'Lo-Fi', desc: 'Morno e vintage, agudos cortados.', key: 'Pop' },
  { name: 'Bass Boost', desc: 'Sub-graves dominantes.', key: 'Bass Boost' },
  { name: 'Voz Clara', desc: 'Presenca vocal destacada.', key: 'Vocal' }
];

const AMBIENTES_PADRAO = ['Pequena', 'Club', 'Concerto', 'Catedral', 'Estádio', 'Vastidão'];
const AMBIENTES_IR = ['Geleira', 'Praia', 'Tubo', 'Squash', 'Túnel', 'Concreto', 'Tanque', 'Masmorra'];
const MATERIAIS = ['Madeira', 'Concreto', 'Vidro', 'Tecido', 'Pedra', 'Metal', 'Carpete'];
const GENEROS = ['Rock', 'Jazz', 'Ambient', 'Orchestral', 'EDM'];
const MOTION_MODES = ['Parado', 'Elipse', 'Figura 8', 'Espiral', 'Vertical', 'Caos', 'Reativo'];

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
  const maxBoostDb = Math.max(0, ...filters.map(f => f.gainDb));
  const safePreampDb = Math.min(profile.preampDb ?? 0, -(maxBoostDb + 0.7));
  return {
    ...profile,
    filters,
    maxBoostDb,
    preampDb: safePreampDb,
    safety: safePreampDb <= -(maxBoostDb + 0.7) ? "OK" : "ADJUSTED"
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

export function EqualizerModal({ 
  isOpen, onClose, gains, setGains, preset, setPreset, 
  playbackRate, setPlaybackRate, preservesPitch, setPreservesPitch, reverbMix, setReverbMix,
  enableTransient, setEnableTransient, transientAttack, setTransientAttack, transientSustain, setTransientSustain,
  enableAdaptiveEq, setEnableAdaptiveEq, enableDeesser, setEnableDeesser, enableDeharsh, setEnableDeharsh,
  enableSaturation, setEnableSaturation, satDrive, setSatDrive, satMode, setSatMode,
  enableSubmono, setEnableSubmono, enableCrossfeed, setEnableCrossfeed, crossfeedAmount, setCrossfeedAmount,
  
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
  enableSpectralGlue, setEnableSpectralGlue,
  spectralGlueThreshold, setSpectralGlueThreshold,
  enableStereoDepth, setEnableStereoDepth,
  stereoDepthAmount, setStereoDepthAmount,
  enableReplayGain, setEnableReplayGain,
  
  autoEqProfile, setAutoEqProfile,
  autoEqAmount, setAutoEqAmount,
  
  abMode, setAbMode,
  abBlend, setAbBlend
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

  const applyPreset = (presetName) => {
    // Reset all enhancements to a default state first
    if (setEnableCrossfeed) setEnableCrossfeed(false);
    if (setEnable8D) setEnable8D(false);
    if (setReverbMix) setReverbMix(0.0);
    if (setBassEnhancer) setBassEnhancer(false);
    if (setEnableSaturation) setEnableSaturation(false);
    if (setStereoWidth) setStereoWidth('Natural');
    if (setMotionMode) setMotionMode('Parado');

    if (presetName === 'Fone Relaxado') {
      if (setEnableCrossfeed) setEnableCrossfeed(true);
      if (setCrossfeedAmount) setCrossfeedAmount(0.7);
      if (setGains) setGains(EQ_PRESETS['Normal']);
      if (setPreset) setPreset('Normal');
    } else if (presetName === 'Cinema 8D') {
      if (setEnable8D) setEnable8D(true);
      if (setMotionMode) setMotionMode('Elipse');
      if (setMotionSpeed) setMotionSpeed(0.6);
      if (setMotionRadius) setMotionRadius(3.5);
      if (setGains) setGains(EQ_PRESETS['Electronic']);
      if (setPreset) setPreset('Electronic');
    } else if (presetName === 'Concerto Ao Vivo') {
      if (setReverbMix) setReverbMix(0.35);
      if (setSpatialMode) setSpatialMode('Club');
      if (setStereoWidth) setStereoWidth('Largo');
      if (setGains) setGains(EQ_PRESETS['Rock']);
      if (setPreset) setPreset('Rock');
    } else if (presetName === 'Estudio Limpo') {
      if (setStereoWidth) setStereoWidth('Natural');
      if (setGains) setGains(EQ_PRESETS['Acoustic']);
      if (setPreset) setPreset('Acoustic');
    } else if (presetName === 'Catedral') {
      if (setReverbMix) setReverbMix(0.65);
      if (setSpatialMode) setSpatialMode('Catedral');
      if (setStereoWidth) setStereoWidth('Ultra');
      if (setGains) setGains(EQ_PRESETS['Pop']);
      if (setPreset) setPreset('Pop');
    } else if (presetName === 'Lo-Fi') {
      if (setEnableSaturation) setEnableSaturation(true);
      if (setSatDrive) setSatDrive(0.8);
      if (setSatMode) setSatMode('tape');
      if (setStereoWidth) setStereoWidth('Estreito');
      if (setGains) setGains([-2, -1, 0, 1, 2, 2, 0, -2, -5, -8]);
      if (setPreset) setPreset('Custom');
    } else if (presetName === 'Bass Boost') {
      if (setBassEnhancer) setBassEnhancer(true);
      if (setBassIntensity) setBassIntensity(80);
      if (setGains) setGains(EQ_PRESETS['Bass Boost']);
      if (setPreset) setPreset('Bass Boost');
    } else if (presetName === 'Voz Clara') {
      if (setStereoWidth) setStereoWidth('Natural');
      if (setGains) setGains(EQ_PRESETS['Vocal']);
      if (setPreset) setPreset('Vocal');
    } else if (EQ_PRESETS[presetName]) {
      if (setGains) setGains(EQ_PRESETS[presetName]);
      if (setPreset) setPreset(presetName);
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
                        <div className="flex space-x-2">
                          {[ {label: 'Leve', val: 0.5}, {label: 'Natural', val: 0.75}, {label: 'Completa', val: 1.0} ].map(amt => (
                            <button
                              key={amt.label}
                              onClick={() => setAutoEqAmount && setAutoEqAmount(amt.val)}
                              className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${autoEqAmount === amt.val ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/10'}`}
                            >
                              {amt.label}
                            </button>
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

                  <div className="flex space-x-2 mb-6">
                    {[
                      { id: 'RAW', label: 'Raw' },
                      { id: 'CALIBRATED', label: 'Ref (Calibrada)' },
                      { id: 'PROCESSED', label: 'Mix (DSP)' }
                    ].map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setAbMode && setAbMode(mode.id)}
                        className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${abMode === mode.id ? 'bg-[var(--md-sys-color-tertiary)] text-[var(--md-sys-color-on-tertiary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline-variant)]/10'}`}
                      >
                        {mode.label}
                      </button>
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
                  <div className="flex space-x-4">
                    <button
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(1.25); if(setPreservesPitch) setPreservesPitch(false); if(setReverbMix) setReverbMix(0.0); }}
                      className="flex-1 py-4 bg-[var(--md-sys-color-tertiary-container)] hover:bg-[var(--md-sys-color-tertiary-container)]/85 text-[var(--md-sys-color-on-tertiary-container)] border border-[var(--md-sys-color-tertiary)]/20 rounded-2xl font-bold transition-all shadow-sm"
                    >
                      Nightcore
                    </button>
                    <button
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(0.85); if(setPreservesPitch) setPreservesPitch(false); if(setReverbMix) setReverbMix(0.5); }}
                      className="flex-1 py-4 bg-[var(--md-sys-color-primary-container)] hover:bg-[var(--md-sys-color-primary-container)]/85 text-[var(--md-sys-color-on-primary-container)] border border-[var(--md-sys-color-primary)]/20 rounded-2xl font-bold transition-all shadow-sm"
                    >
                      Slowed + Reverb
                    </button>
                    <button
                      onClick={() => { if(setPlaybackRate) setPlaybackRate(1.0); if(setPreservesPitch) setPreservesPitch(true); if(setReverbMix) setReverbMix(0.0); }}
                      className="flex-1 py-4 bg-transparent text-[var(--md-sys-color-on-surface)] font-bold transition-colors hover:bg-white/5 rounded-2xl border border-[var(--md-sys-color-outline-variant)]/20"
                    >
                      Resetar
                    </button>
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
                      <div className="flex space-x-2">
                        {['Estreito', 'Natural', 'Largo', 'Ultra'].map(w => (
                          <button key={w} onClick={() => setStereoWidth(w)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${w === stereoWidth ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/10 text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80'}`}>{w}</button>
                        ))}
                      </div>
                    </div>

                    {/* Harmonic Exciter */}
                    <div>
                      <label className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-4 block">Harmonic Exciter</label>
                      <div className="flex space-x-2">
                        {['Off', 'Sutil', 'Medio', 'Forte'].map(w => (
                          <button 
                            key={w} 
                            onClick={() => setExciterLevel(w)}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all ${w === getExciterLevel() ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/10 text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80'}`}>{w}</button>
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
                        <div className="flex space-x-2 mt-2">
                          {[
                            {name: 'Seguro', lufs: '-18 LUFS'}, {name: 'Normal', lufs: '-16 LUFS'},
                            {name: 'Alto', lufs: '-14 LUFS'}, {name: 'Noite', lufs: '-20 LUFS'}
                          ].map(w => (
                            <button key={w.name} onClick={() => setLufsMode(w.name)} className={`flex-1 py-2 flex flex-col items-center justify-center rounded-xl transition-all ${w.name === lufsMode ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/10 text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80'}`}>
                              <span className="text-xs font-bold">{w.name}</span>
                              <span className="text-[9px] opacity-80">{w.lufs}</span>
                            </button>
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
                    <div className="flex flex-wrap gap-3">
                      {AMBIENTES_PADRAO.map((amb) => (
                        <button key={amb} onClick={() => setSpatialMode && setSpatialMode(amb)} className={`px-6 py-2 rounded-full border text-xs font-bold transition-all ${amb === spatialMode ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]/10 shadow-sm' : 'border-[var(--md-sys-color-outline-variant)]/30 hover:bg-white/5 text-[var(--md-sys-color-on-surface)]'}`}>
                          {amb}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-2">IR SPACES / EXPERIMENTAL</h3>
                    <p className="text-[10px] text-[var(--md-sys-color-error)] mb-3 opacity-80 font-bold">Aviso: Modo experimental. Estes ambientes possuem assinaturas acústicas extremas.</p>
                    <div className="flex flex-wrap gap-2">
                      {AMBIENTES_IR.map((amb) => (
                        <button key={amb} onClick={() => setSpatialMode && setSpatialMode(amb)} className={`px-4 py-1.5 rounded-full border text-[11px] font-bold transition-all ${amb === spatialMode ? 'border-[var(--md-sys-color-error)] text-[var(--md-sys-color-error)] bg-[var(--md-sys-color-error)]/10 shadow-sm' : 'border-[var(--md-sys-color-outline-variant)]/30 hover:bg-white/5 text-[var(--md-sys-color-on-surface-variant)]'}`}>
                          {amb}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-4">MATERIAL ACÚSTICO</h3>
                  <div className="flex flex-wrap gap-3">
                    {MATERIAIS.map((mat) => (
                      <button key={mat} onClick={() => setRoomMaterial && setRoomMaterial(mat)} className={`px-6 py-2 rounded-full border text-xs font-bold transition-all ${mat === roomMaterial ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]/10 shadow-sm' : 'border-[var(--md-sys-color-outline-variant)]/30 hover:bg-white/5 text-[var(--md-sys-color-on-surface)]'}`}>
                        {mat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-b border-[var(--md-sys-color-outline-variant)]/10 pb-8">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-1">PERFIL POR GENERO</h3>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-4">Configura EQ + espacial para o gênero da música.</p>
                  <div className="flex flex-wrap gap-3">
                    {GENEROS.map((gen) => (
                      <button key={gen} onClick={() => setGenreProfile(gen)} className={`px-6 py-2 rounded-full border text-xs font-bold transition-all ${gen === genreProfile ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary)]/10 shadow-sm' : 'border-[var(--md-sys-color-outline-variant)]/30 hover:bg-white/5 text-[var(--md-sys-color-on-surface)]'}`}>
                        {gen}
                      </button>
                    ))}
                  </div>
                </div>

                {/* MOTION SYSTEM */}
                <div className="pt-2 space-y-6">
                  <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] uppercase tracking-wider mb-1">MOTION SYSTEM</h3>
                  <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-4">Move o som em trajetórias ao redor da cabeça. Requer Áudio Espacial ativo.</p>
                  
                  <div className="grid grid-cols-4 gap-2">
                    {MOTION_MODES.map((mode) => (
                      <button key={mode} onClick={() => setMotionMode(mode)} className={`py-3 px-1 rounded-xl text-xs font-bold transition-all text-center ${mode === motionMode ? 'bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-md' : 'bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)]/10 text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-highest)]/80'}`}>
                        {mode}
                      </button>
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
