import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Check, AlertTriangle, Zap, Radio, Cpu } from 'lucide-react';

/**
 * AudioDiagnosticsPanel
 * Props:
 *   isOpen: bool
 *   onClose: fn
 *   audioContextRef: ref to AudioContext
 *   analyserRef: ref to AnalyserNode
 *   masterGainRef: ref to master GainNode
 *   crossfeedRef: ref to { cfGainLR, cfGainRL }
 *   stereoWidthRef: ref to sideBus GainNode
 *   exciterNodeRef: ref to WaveShaperNode
 *   limiterRef: ref to DynamicsCompressorNode
 *   occlusionFilterRef: ref to BiquadFilterNode
 *   workletAnchorRef: ref to { pre, post }
 *   eqFiltersRef: ref to array of BiquadFilterNodes
 */
export function AudioDiagnosticsPanel({
  isOpen, onClose,
  audioContextRef, analyserRef, masterGainRef,
  crossfeedRef, stereoWidthRef, exciterNodeRef,
  limiterRef, occlusionFilterRef, workletAnchorRef,
  eqFiltersRef,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [lufs, setLufs] = useState(null);
  const [reduction, setReduction] = useState(null);

  // ---- Inspect all nodes ------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const checkNodes = () => {
      const ctx = audioContextRef?.current;
      const results = [
        {
          label: 'AudioContext',
          ok: !!ctx,
          detail: ctx ? `state: ${ctx.state} | sr: ${ctx.sampleRate}Hz` : 'not initialized',
          icon: 'ctx',
        },
        {
          label: 'EQ (10 bandas)',
          ok: !!(eqFiltersRef?.current?.length === 10),
          detail: eqFiltersRef?.current?.length
            ? `${eqFiltersRef.current.length} filtros BiquadFilter`
            : 'não inicializado',
          icon: 'eq',
        },
        {
          label: 'Crossfeed',
          ok: !!crossfeedRef?.current?.cfGainLR,
          detail: crossfeedRef?.current
            ? `LR gain: ${crossfeedRef.current.cfGainLR?.gain?.value?.toFixed(3)} | RL: ${crossfeedRef.current.cfGainRL?.gain?.value?.toFixed(3)}`
            : 'não inicializado',
          icon: 'cf',
        },
        {
          label: 'Harmonic Exciter (Worklet)',
          ok: !!exciterNodeRef?.current,
          detail: exciterNodeRef?.current
            ? 'Processador Paralelo ADAA Ativo'
            : 'não inicializado',
          icon: 'exc',
        },
        {
          label: 'Stereo Width (Worklet)',
          ok: !!stereoWidthRef?.current,
          detail: stereoWidthRef?.current
            ? 'Crossover TPT M/S Ativo'
            : 'não inicializado',
          icon: 'sw',
        },
        {
          label: 'Occlusion Filter',
          ok: !!occlusionFilterRef?.current,
          detail: occlusionFilterRef?.current
            ? `lowpass freq: ${Math.round(occlusionFilterRef.current.frequency?.value)} Hz`
            : 'não inicializado',
          icon: 'occ',
        },
        {
          label: 'Limiter (Brickwall)',
          ok: !!limiterRef?.current,
          detail: limiterRef?.current
            ? `threshold: ${limiterRef.current.threshold?.value}dB | ratio: ${limiterRef.current.ratio?.value}:1`
            : 'não inicializado',
          icon: 'lim',
        },
        {
          label: 'Master Gain (LUFS)',
          ok: !!masterGainRef?.current,
          detail: masterGainRef?.current
            ? `gain: ${masterGainRef.current.gain?.value?.toFixed(3)}`
            : 'não inicializado',
          icon: 'mg',
        },
        {
          label: 'Worklet Anchor',
          ok: !!workletAnchorRef?.current?.pre,
          detail: workletAnchorRef?.current
            ? 'nós de bypass pre/post prontos'
            : 'não inicializado',
          icon: 'wk',
        },
        {
          label: 'Analyser',
          ok: !!analyserRef?.current,
          detail: analyserRef?.current
            ? `fftSize: ${analyserRef.current.fftSize}`
            : 'não inicializado',
          icon: 'an',
        },
      ];
      setNodes(results);
    };

    checkNodes();
    const interval = setInterval(checkNodes, 1500);
    return () => clearInterval(interval);
  }, [isOpen, audioContextRef, analyserRef, masterGainRef, crossfeedRef,
      stereoWidthRef, exciterNodeRef, limiterRef, occlusionFilterRef,
      workletAnchorRef, eqFiltersRef]);

  // ---- Live RMS + Limiter reduction meter -------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const tick = () => {
      const analyser = analyserRef?.current;
      const lim = limiterRef?.current;
      if (analyser) {
        const data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length);
        if (rms > 0.0001) setLufs(+(20 * Math.log10(rms)).toFixed(1));
      }
      if (lim) {
        setReduction(+(lim.reduction).toFixed(1));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isOpen, analyserRef, limiterRef]);

  // ---- Scope / waveform canvas ------------------------------------------
  useEffect(() => {
    if (!isOpen || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx2d = canvas.getContext('2d');
    let raf;

    const draw = () => {
      const analyser = analyserRef?.current;
      if (!analyser) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);
      const W = canvas.width, H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = '#0a0a0a';
      ctx2d.fillRect(0, 0, W, H);

      const barW = (W / data.length) * 2.5;
      let x = 0;
      for (let i = 0; i < data.length; i++) {
        const h = (data[i] / 255) * H;
        const hue = 200 + (data[i] / 255) * 80;
        ctx2d.fillStyle = `hsl(${hue}, 80%, 55%)`;
        ctx2d.fillRect(x, H - h, barW, h);
        x += barW + 1;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, analyserRef]);

  if (!isOpen) return null;

  const allOk = nodes.filter(n => n.ok).length;
  const allTotal = nodes.length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ scale: 0.92, y: 24 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 24 }}
          className="bg-surface rounded-3xl shadow-2xl border border-outline-variant/30 w-full max-w-2xl max-h-[90vh] overflow-y-auto m-4"
        >
          {/* Header */}
          <div className="sticky top-0 bg-surface z-10 flex items-center justify-between p-6 border-b border-outline-variant/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <Activity size={20} className="text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-on-surface text-lg">Diagnóstico de Áudio</h2>
                <p className="text-xs text-on-surface-variant">
                  {allOk}/{allTotal} nós ativos
                </p>
              </div>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Spectrum Analyzer */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                <Radio size={10} /> Spectrum Analyser (Tempo Real)
              </p>
              <canvas
                ref={canvasRef}
                width={640}
                height={100}
                className="w-full rounded-xl border border-outline-variant/20"
              />
            </div>

            {/* Live Meters */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/20">
                <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Nível (RMS aprox.)</p>
                <p className={`text-2xl font-mono font-bold mt-1 ${lufs === null ? 'text-on-surface-variant' : lufs > -6 ? 'text-error' : 'text-primary'}`}>
                  {lufs !== null ? `${lufs} dB` : '--'}
                </p>
              </div>
              <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/20">
                <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Limiter GR</p>
                <p className={`text-2xl font-mono font-bold mt-1 ${reduction !== null && reduction < -1 ? 'text-yellow-400' : 'text-primary'}`}>
                  {reduction !== null ? `${reduction} dB` : '--'}
                </p>
              </div>
            </div>

            {/* Node Status List */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 flex items-center gap-1">
                <Cpu size={10} /> Status dos Nós da Chain
              </p>
              <div className="space-y-2">
                {nodes.map((node, i) => (
                  <motion.div
                    key={node.label}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${
                      node.ok
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-error/5 border-error/20'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      node.ok ? 'bg-primary/15' : 'bg-error/15'
                    }`}>
                      {node.ok
                        ? <Check size={14} className="text-primary" />
                        : <AlertTriangle size={14} className="text-error" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-on-surface">{node.label}</p>
                      <p className="text-[10px] text-on-surface-variant truncate">{node.detail}</p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      node.ok ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error'
                    }`}>
                      {node.ok ? 'OK' : 'INATIVO'}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Test Signal Guide */}
            <div className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant/20 space-y-2">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 flex items-center gap-1">
                <Zap size={10} /> Guia de Teste Manual
              </p>
              {[
                ['EQ', 'Suba a banda de 8kHz. Os pratos da música devem ficar mais agudos.'],
                ['Reverb', 'Suba para 80%. A voz deve ganhar um eco nítido.'],
                ['Crossfeed', 'Suba para 100% com fone de ouvido. O som deve sair "da frente" ao invés de "dentro da cabeça".'],
                ['Exciter', 'Mude de Off → Forte. O brilho nos agudos deve aumentar perceptivelmente.'],
                ['Stereo Width', 'Mude para Ultra. Os instrumentos laterais devem parecer mais distantes.'],
                ['Limiter GR', 'Se o medidor acima mostrar < -1dB, o limiter está em ação (normal em músicas altas).'],
                ['Áudio Espacial 8D', 'Ative o toggle 8D. Com fone de ouvido, o som deve rotacionar ao redor da cabeça.'],
                ['Transient Shaper', 'Ative o worklet. Em música com bateria, o kick deve soar mais "seco" e definido.'],
                ['Adaptive EQ', 'Ative o worklet. Em músicas muito graves, o médio deve compensar automaticamente.'],
              ].map(([feat, desc]) => (
                <div key={feat} className="flex gap-2 text-[10px]">
                  <span className="font-bold text-primary shrink-0 w-28">{feat}</span>
                  <span className="text-on-surface-variant">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
