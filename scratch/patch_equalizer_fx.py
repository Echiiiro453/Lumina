import os
import re

file_path = r'e:\youtubr\youtubeMusicDownload-main\frontend\src\components\EqualizerModal.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Add useState to imports
content = content.replace("import React from 'react';", "import React, { useState } from 'react';")

# Update props
old_props = "export function EqualizerModal({ isOpen, onClose, gains, setGains, preset, setPreset }) {"
new_props = "export function EqualizerModal({ isOpen, onClose, gains, setGains, preset, setPreset, playbackRate, setPlaybackRate, preservesPitch, setPreservesPitch, reverbMix, setReverbMix }) {"
content = content.replace(old_props, new_props)

# Add activeTab state
tab_state = """  const [activeTab, setActiveTab] = useState('eq');
  if (!isOpen) return null;"""
content = content.replace("  if (!isOpen) return null;", tab_state)

# Update Header to have Tabs
old_header = """          {/* Header */}
          <div className="p-6 border-b border-surface-variant flex justify-between items-center bg-surface/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <SlidersHorizontal size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-on-surface">Equalizador</h2>
                <p className="text-sm text-on-surface-variant">Ajuste o áudio em tempo real</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
            >
              <X size={24} />
            </button>
          </div>"""

new_header = """          {/* Header */}
          <div className="p-6 border-b border-surface-variant flex justify-between items-center bg-surface/50">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary">
                <SlidersHorizontal size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-on-surface">Estúdio de Áudio</h2>
                <p className="text-sm text-on-surface-variant">Equalizador & Efeitos (FX)</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-surface-variant rounded-full transition-colors text-on-surface-variant hover:text-on-surface"
            >
              <X size={24} />
            </button>
          </div>
          
          {/* Tabs */}
          <div className="flex border-b border-surface-variant bg-surface-container-low">
            <button
              onClick={() => setActiveTab('eq')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'eq' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant'}`}
            >
              Equalizador 🎚️
            </button>
            <button
              onClick={() => setActiveTab('fx')}
              className={`flex-1 py-3 text-sm font-bold transition-colors ${activeTab === 'fx' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-on-surface-variant hover:bg-surface-variant'}`}
            >
              Efeitos (FX) 🎛️
            </button>
          </div>"""
content = content.replace(old_header, new_header)

old_body_start = """          {/* Body */}
          <div className="p-6 space-y-8">"""

new_body_start = """          {/* Body */}
          <div className="p-6 space-y-8 h-[400px] overflow-y-auto custom-scrollbar">
            {activeTab === 'eq' && (
              <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="space-y-8">"""
content = content.replace(old_body_start, new_body_start)

old_body_end = """            <div className="bg-tertiary/10 p-3 rounded-lg border border-tertiary/20 flex items-start space-x-3">
              <span className="text-tertiary text-sm mt-0.5">ℹ️</span>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Este equalizador é aplicado nativamente em tempo real sobre a faixa de áudio. Dependendo do preset escolhido (como Bass Boost alto), faixas que já têm muito ganho natural podem distorcer. Ajuste conforme seu dispositivo de som.
              </p>
            </div>
          </div>"""

new_body_end = """            <div className="bg-tertiary/10 p-3 rounded-lg border border-tertiary/20 flex items-start space-x-3">
              <span className="text-tertiary text-sm mt-0.5">ℹ️</span>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Este equalizador é aplicado nativamente em tempo real sobre a faixa de áudio. Dependendo do preset escolhido, faixas que já têm muito ganho natural podem distorcer.
              </p>
            </div>
              </motion.div>
            )}
            
            {activeTab === 'fx' && (
              <motion.div initial={{opacity:0, x:20}} animate={{opacity:1, x:0}} className="space-y-8">
                
                {/* Botões de Preset Rápidos */}
                <div>
                  <h3 className="text-sm font-semibold text-on-surface-variant mb-4">Presets Rápidos</h3>
                  <div className="flex space-x-4">
                    <button
                      onClick={() => { setPlaybackRate(1.25); setPreservesPitch(false); setReverbMix(0.0); }}
                      className="flex-1 py-3 bg-[#ff2a5f]/10 hover:bg-[#ff2a5f]/20 text-[#ff2a5f] border border-[#ff2a5f]/30 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(255,42,95,0.1)]"
                    >
                      🚀 Nightcore
                    </button>
                    <button
                      onClick={() => { setPlaybackRate(0.85); setPreservesPitch(false); setReverbMix(0.5); }}
                      className="flex-1 py-3 bg-[#a855f7]/10 hover:bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30 rounded-xl font-bold transition-all shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                    >
                      🌌 Slowed + Reverb
                    </button>
                    <button
                      onClick={() => { setPlaybackRate(1.0); setPreservesPitch(true); setReverbMix(0.0); }}
                      className="flex-1 py-3 bg-surface-variant text-on-surface rounded-xl font-bold transition-colors"
                    >
                      🔄 Resetar
                    </button>
                  </div>
                </div>

                <div className="h-px bg-outline-variant/30 w-full" />

                {/* Controles Manuais */}
                <div className="space-y-6">
                  {/* Velocidade */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-medium text-on-surface">Velocidade (Speed)</label>
                      <span className="text-sm font-mono text-primary">{playbackRate.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range" min="0.5" max="2.0" step="0.05"
                      value={playbackRate} onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Reverb */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-sm font-medium text-on-surface">Eco / Reverb</label>
                      <span className="text-sm font-mono text-primary">{Math.round(reverbMix * 100)}%</span>
                    </div>
                    <input
                      type="range" min="0" max="1" step="0.05"
                      value={reverbMix} onChange={(e) => setReverbMix(parseFloat(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>

                  {/* Pitch Toggle */}
                  <label className="flex items-center space-x-3 p-4 bg-surface-container-high rounded-xl border border-outline-variant/30 cursor-pointer hover:bg-surface-container-highest transition-colors">
                    <div className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" checked={!preservesPitch} onChange={(e) => setPreservesPitch(!e.target.checked)} />
                      <div className="w-11 h-6 bg-surface-variant peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                    </div>
                    <div>
                      <span className="text-sm font-bold text-on-surface block">Mudar Voz junto com a Velocidade</span>
                      <span className="text-xs text-on-surface-variant">Necessário para Nightcore e Slowed.</span>
                    </div>
                  </label>
                </div>

              </motion.div>
            )}
          </div>"""
content = content.replace(old_body_end, new_body_end)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print("EqualizerModal.jsx patcheado com a aba FX!")
