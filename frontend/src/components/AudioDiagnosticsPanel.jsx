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
  eqFiltersRef, wetHpfRef, wetMidEqRef, wetHighEqRef, wetLpfRef, masterTelemetryRef,
  analyserLRef, analyserRRef
}) {
  const canvasRef = useRef(null);
  const curveCanvasRef = useRef(null);
  const rafRef = useRef(null);
  const curveRafRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [lufs, setLufs] = useState(null);
  const [reduction, setReduction] = useState(null);
  const [masterTelemetry, setMasterTelemetry] = useState(null);

  const vectorCanvasRef = useRef(null);
  const [vectorMetrics, setVectorMetrics] = useState({ correlation: 0, width: 0, phaseRisk: 'LOW' });

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

  // ---- Telemetry Polling ------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      if (masterTelemetryRef?.current) {
        setMasterTelemetry({ ...masterTelemetryRef.current });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isOpen, masterTelemetryRef]);

  // ---- Stereo Vectorscope / Goniometer -----------------------------------
  useEffect(() => {
    if (!isOpen || !vectorCanvasRef.current) return;
    const canvas = vectorCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let frameCount = 0;

    const drawVectorscope = () => {
      raf = requestAnimationFrame(drawVectorscope);
      
      const tele = stereoTelemetryRef?.current;
      if (!tele) return;

      const W = canvas.width, H = canvas.height;
      
      // Efeito de rastro (Fade out)
      ctx.fillStyle = 'rgba(10, 10, 10, 0.4)';
      ctx.fillRect(0, 0, W, H);

      // Grid central (cruz)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H);
      ctx.moveTo(0, H/2); ctx.lineTo(W, H/2);
      ctx.stroke();

      if (tele.points && tele.points.length > 0) {
        ctx.beginPath();
        // Se correlation for negativa, muda a cor pra alertar
        ctx.strokeStyle = parseFloat(tele.corr) < 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(139, 92, 246, 0.8)';
        ctx.lineWidth = 1.5;

        for (let i = 0; i < tele.points.length; i++) {
          const [side, mid] = tele.points[i];
          
          const x = (W / 2) + (side * (W / 2));
          const y = (H / 2) - (mid * (H / 2));

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      frameCount++;
      if (frameCount % 6 === 0) { // Update metrics UI
        setVectorMetrics({
          correlation: parseFloat(tele.corr || 0),
          width: parseFloat(tele.widthPercent || 0),
          phaseRisk: tele.phaseRisk || 'LOW',
          midRMSDb: tele.midRMSDb || '-INF',
          sideRMSDb: tele.sideRMSDb || '-INF',
          monoCompatible: tele.monoCompatible
        });
      }
    };

    drawVectorscope();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, stereoTelemetryRef]);

  // Canvas unificado (Espectro + Curva)

  // ---- Damping Curve Visualizer ------------------------------------------
  useEffect(() => {
    if (!isOpen || !curveCanvasRef.current) return;
    const canvas = curveCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;

    const drawCurve = () => {
      const hpf = wetHpfRef?.current;
      const lpf = wetLpfRef?.current;
      const mid = wetMidEqRef?.current;
      const high = wetHighEqRef?.current;
      
      if (!hpf || !lpf || !mid || !high) {
        raf = requestAnimationFrame(drawCurve);
        return;
      }

      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, W, H);

      // 1. Draw Real-time Spectrum Analyzer
      const analyser = analyserRef?.current;
      if (analyser) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const barW = (W / data.length) * 2.5;
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          // Map index to logarithmic frequency scale to match the Damping Curve
          const freq = analyser.context.sampleRate / 2 * (i / data.length);
          if (freq >= 20 && freq <= 20000) {
             const xLog = (Math.log(freq / 20) / Math.log(20000 / 20)) * (W - 1);
             const h = (data[i] / 255) * H;
             const hue = 200 + (data[i] / 255) * 80;
             ctx.fillStyle = `hsla(${hue}, 80%, 55%, 0.6)`;
             ctx.fillRect(xLog, H - h, Math.max(1, barW), h);
          }
        }
      }

      const numPoints = W;
      const freqArray = new Float32Array(numPoints);
      
      // Logarithmic frequency scale (20Hz to 20000Hz)
      const minFreq = 20;
      const maxFreq = 20000;
      for (let i = 0; i < numPoints; i++) {
        freqArray[i] = minFreq * Math.pow(maxFreq / minFreq, i / (numPoints - 1));
      }

      const magHpf = new Float32Array(numPoints);
      const phaseHpf = new Float32Array(numPoints);
      hpf.getFrequencyResponse(freqArray, magHpf, phaseHpf);

      const magLpf = new Float32Array(numPoints);
      const phaseLpf = new Float32Array(numPoints);
      lpf.getFrequencyResponse(freqArray, magLpf, phaseLpf);

      const magMid = new Float32Array(numPoints);
      const phaseMid = new Float32Array(numPoints);
      mid.getFrequencyResponse(freqArray, magMid, phaseMid);

      const magHigh = new Float32Array(numPoints);
      const phaseHigh = new Float32Array(numPoints);
      high.getFrequencyResponse(freqArray, magHigh, phaseHigh);

      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const totalMag = Math.max(magHpf[i] * magLpf[i] * magMid[i] * magHigh[i], 1e-6);
        const db = 20 * Math.log10(totalMag);
        
        // Map -30dB to +10dB into canvas height
        const minDb = -30;
        const maxDb = 10;
        let y = H - ((db - minDb) / (maxDb - minDb)) * H;
        y = Math.max(0, Math.min(H, y));

        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }

      // Fill area under curve
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.closePath();
      
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
      grad.addColorStop(1, 'rgba(139, 92, 246, 0.0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Draw Grid Lines
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '9px monospace';
      ctx.lineWidth = 1;
      
      // 0 dB Line
      const y0dB = H - ((0 - (-30)) / 40) * H;
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(0, y0dB);
      ctx.lineTo(W, y0dB);
      ctx.stroke();
      ctx.fillText('0dB', 5, y0dB - 4);
      
      // Vertical frequency markers
      const markers = [100, 1000, 10000];
      const labels = ['100Hz', '1kHz', '10kHz'];
      markers.forEach((freq, idx) => {
        // Find x coordinate using the inverse of logarithmic mapping:
        // freq = minFreq * (maxFreq/minFreq)^(x / (W - 1))
        // Math.log(freq / minFreq) / Math.log(maxFreq / minFreq) = x / (W - 1)
        const xFreq = (Math.log(freq / 20) / Math.log(20000 / 20)) * (W - 1);
        ctx.beginPath();
        ctx.moveTo(xFreq, 0);
        ctx.lineTo(xFreq, H);
        ctx.stroke();
        ctx.fillText(labels[idx], xFreq + 4, H - 5);
      });
      ctx.setLineDash([]); // reset dash

      // Draw curve line
      ctx.beginPath();
      for (let i = 0; i < numPoints; i++) {
        const totalMag = Math.max(magHpf[i] * magLpf[i] * magMid[i] * magHigh[i], 1e-6);
        const db = 20 * Math.log10(totalMag);
        let y = H - ((db + 30) / 40) * H;
        y = Math.max(0, Math.min(H, y));
        if (i === 0) ctx.moveTo(i, y);
        else ctx.lineTo(i, y);
      }
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw text overlay with current parameters
      const lpfVal = lpf.frequency?.value || 0;
      const hpfVal = hpf.frequency?.value || 0;
      const hfDb = high.gain?.value || 0;
      const midDb = mid.gain?.value || 0;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = 'bold 10px monospace';
      const text = `HPF: ${Math.round(hpfVal)}Hz | LPF: ${(lpfVal/1000).toFixed(1)}kHz | Mid: ${midDb.toFixed(1)}dB | HF: ${hfDb.toFixed(1)}dB`;
      ctx.fillText(text, W - ctx.measureText(text).width - 10, 15);

      raf = requestAnimationFrame(drawCurve);
    };

    drawCurve();
    return () => cancelAnimationFrame(raf);
  }, [isOpen, wetHpfRef, wetLpfRef, wetMidEqRef, wetHighEqRef, analyserRef]);

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
            {/* Spectrum & Damping Curve */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                <Radio size={10} /> Real-time Spectrum & Room Damping Curve
              </p>
              <canvas
                ref={curveCanvasRef}
                width={640}
                height={140}
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

            {/* MASTER OUT Box */}
            {masterTelemetry && (
              <div className={`p-4 rounded-2xl border ${masterTelemetry.clipCount > 0 ? 'bg-error/10 border-error/30' : masterTelemetry.clipCount === 0 && masterTelemetry.peakDb > -0.5 ? 'bg-yellow-400/10 border-yellow-400/30' : 'bg-green-400/5 border-green-400/30'}`}>
                <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 flex items-center gap-1">
                   <Activity size={12} /> Master Out (Airbag / True Peak)
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Peak</p>
                    <p className={`text-xl font-mono font-bold ${masterTelemetry.peakDb > -1.0 ? 'text-yellow-400' : 'text-primary'}`}>
                      {masterTelemetry.peakDb !== undefined ? masterTelemetry.peakDb : '--'} dB
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Clips</p>
                    <p className={`text-xl font-mono font-bold ${masterTelemetry.clipCount > 0 ? 'text-error' : 'text-primary'}`}>
                      {masterTelemetry.clipCount !== undefined ? masterTelemetry.clipCount : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Safety</p>
                    <p className={`text-xl font-mono font-bold ${masterTelemetry.clipCount > 0 ? 'text-error' : masterTelemetry.peakDb > -0.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                      {masterTelemetry.clipCount > 0 ? 'RED' : masterTelemetry.peakDb > -0.5 ? 'YELLOW' : 'GREEN'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Headroom</p>
                    <p className="text-sm font-mono font-bold text-on-surface">
                      {masterTelemetry.headroomDb !== undefined ? masterTelemetry.headroomDb : '--'} dB
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">PreGain</p>
                    <p className="text-sm font-mono font-bold text-on-surface">
                      {masterTelemetry.preGain !== undefined ? masterTelemetry.preGain : '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Limiter GR</p>
                    <p className="text-sm font-mono font-bold text-on-surface">
                      {masterTelemetry.limiterReductionDb !== undefined ? `-${masterTelemetry.limiterReductionDb}` : '--'} dB
                    </p>
                  </div>
                </div>
              </div>
            )}
            </div>

            {/* Stereo Vectorscope */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                <Radio size={10} /> Stereo Vectorscope & Phase Meter
              </p>
              <div className="flex gap-4 items-center bg-surface-container rounded-2xl p-4 border border-outline-variant/20">
                <div className="w-[140px] h-[140px] bg-[#0a0a0a] rounded-full border border-outline-variant/20 overflow-hidden relative shadow-inner">
                   <canvas
                     ref={vectorCanvasRef}
                     width={140}
                     height={140}
                     className="absolute inset-0"
                   />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Correlation</p>
                    <p className={`text-xl font-mono font-bold ${vectorMetrics.correlation < 0 ? 'text-error' : 'text-primary'}`}>
                      {vectorMetrics.correlation > 0 ? '+' : ''}{vectorMetrics.correlation.toFixed(2)}
                    </p>
                    <div className="w-full bg-surface-container-highest h-1.5 rounded-full mt-1 overflow-hidden flex">
                       <div className="h-full bg-error" style={{ width: '50%', transformOrigin: 'right', transform: `scaleX(${vectorMetrics.correlation < 0 ? Math.abs(vectorMetrics.correlation) : 0})` }} />
                       <div className="h-full bg-primary" style={{ width: '50%', transformOrigin: 'left', transform: `scaleX(${vectorMetrics.correlation > 0 ? vectorMetrics.correlation : 0})` }} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Stereo Width</p>
                    <p className="text-xl font-mono font-bold text-primary">
                      {vectorMetrics.width.toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Mid</p>
                    <p className="text-sm font-mono font-bold text-on-surface">{vectorMetrics.midRMSDb} dB</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Side</p>
                    <p className="text-sm font-mono font-bold text-on-surface">{vectorMetrics.sideRMSDb} dB</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Phase Risk</p>
                    <p className={`text-sm font-mono font-bold ${vectorMetrics.phaseRisk === 'HIGH' ? 'text-error' : vectorMetrics.phaseRisk === 'MEDIUM' ? 'text-yellow-400' : 'text-green-400'}`}>
                      {vectorMetrics.phaseRisk}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold">Mono</p>
                    <p className={`text-sm font-mono font-bold ${vectorMetrics.monoCompatible ? 'text-green-400' : 'text-error'}`}>
                      {vectorMetrics.monoCompatible ? 'OK' : 'RISCO'}
                    </p>
                  </div>
                </div>
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
