import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Activity, Check, AlertTriangle, Zap, Radio, Cpu, ShieldAlert, Play, Sliders, FileSearch, ShieldCheck, AlertCircle, FileAudio, RefreshCw } from 'lucide-react';
import { TEST_SUITES, runAudioTest, runDspSoakTest } from '../utils/audioTortureRunner';
import { AUTO_CALIBRATION_PROFILES, calculateAnticipativeHeadroom } from '../audio/presets/autoCalibrationProfiles';
import { createHealthSnapshot, createHealthSoakReport, downloadJsonReport, evaluateHealthAlerts } from '../utils/healthSnapshot';
import { logToCMD } from './PlayerBar';

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
function M3Chip({ label, selected, onClick, disabled, icon: Icon, checkIcon = true }) {
  return (
    <motion.button
      whileTap={disabled ? {} : { scale: 0.95 }}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
        selected
          ? 'bg-primary/20 border-primary text-primary shadow-sm shadow-primary/5 hover:bg-primary/30'
          : 'bg-surface-container-high/40 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      {selected && checkIcon && <Check size={11} className="stroke-[3]" />}
      {Icon && <Icon size={11} />}
      <span>{label}</span>
    </motion.button>
  );
}

export function AudioDiagnosticsPanel({
  isOpen, onClose,
  currentSong, isPlaying, audioRef,
  audioContextRef, analyserRef, masterGainRef,
  crossfeedRef, stereoWidthRef, exciterNodeRef,
  limiterRef, occlusionFilterRef, workletAnchorRef,
  eqFiltersRef, wetHpfRef, wetMidEqRef, wetHighEqRef, wetLpfRef, masterTelemetryRef,
  stereoTelemetryRef,
  sourceQualityTelemetryRef, multibandStereoTelemetryRef, sourceQualityRef,
  setEqGains, setStereoWidth, setBassEnhancer, setBassIntensity, setSpatialMode,
  setReverbMix, setHarmonicExciter, setEnableDeesser, setEnableDeharsh,
  setEnableSaturation, setSatDrive, setSatMix, setSaturationOutputTrimDb, setSatMode, setEnableStereoDepth,
  setStereoDepthAmount, setEnable8D, setEnableTransient, truePeakNodeRef,
  lastResumeStatusRef,
  setAutoCalibProfile
}) {
  const curveCanvasRef = useRef(null);
  const rafRef = useRef(null);
  const [nodes, setNodes] = useState([]);
  const [lufs, setLufs] = useState(null);
  const [reduction, setReduction] = useState(null);
  const [masterTelemetry, setMasterTelemetry] = useState(null);
  
  // Spectral Authenticity States
  const [spectralData, setSpectralData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState(null);
  const [analyzedFile, setAnalyzedFile] = useState(null);

  useEffect(() => {
    if (currentSong?.file !== analyzedFile) {
      setSpectralData(null);
      setAnalyzeError(null);
    }
  }, [currentSong, analyzedFile]);

  const handleRunSpectralAnalysis = async () => {
    if (!currentSong?.file) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);
    try {
      const response = await fetch('http://localhost:8000/api/spectral-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: currentSong.file })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Falha na análise espectral');
      }
      const data = await response.json();
      setSpectralData(data);
      setAnalyzedFile(currentSong.file);
    } catch (err) {
      setAnalyzeError(err.message || String(err));
    } finally {
      setIsAnalyzing(false);
    }
  };
  const [sourceTelemetry, setSourceTelemetry] = useState(null);
  const [multibandTelemetry, setMultibandTelemetry] = useState(null);
  const [truePeakMode, setTruePeakMode] = useState(2);
  const [activeTab, setActiveTab] = useState('painel');
  const [uiFps, setUiFps] = useState(60);
  const smoothScoreRef = useRef(100);
  const isWarmupRef = useRef(true);
  const [activeProfile, setActiveProfile] = useState(null);
  const [calibStatus, setCalibStatus] = useState('OK');
  const [calibTelemetry, setCalibTelemetry] = useState(null);

  const getDropoutRisk = (cpuMs, recentUnderruns) => {
    if (recentUnderruns > 5) return { label: 'CRÍTICO', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' };
    if (recentUnderruns > 0) return { label: 'MÉDIO', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    return { label: 'BAIXO', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  };

  useEffect(() => {
    if (!isOpen) {
      isWarmupRef.current = true;
      return;
    }
    
    setUiFps(60); // Reset immediately to 60 on open
    isWarmupRef.current = true;
    const timer = setTimeout(() => {
      isWarmupRef.current = false;
    }, 1500);

    let lastTime = performance.now();
    let frameCount = 0;
    let rafId;
    const measureFps = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        setUiFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(measureFps);
    };
    rafId = requestAnimationFrame(measureFps);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [isOpen]);

  const vectorCanvasRef = useRef(null);
  const [vectorMetrics, setVectorMetrics] = useState({ correlation: 0, width: 0, phaseRisk: 'LOW' });

  const [testResults, setTestResults] = useState(null);
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState('');
  
  const [soakResult, setSoakResult] = useState(null);
  const [isSoakTesting, setIsSoakTesting] = useState(false);
  const [soakProgress, setSoakProgress] = useState('');
  const [healthSnapshot, setHealthSnapshot] = useState(null);
  const [healthSoak, setHealthSoak] = useState(null);
  const healthSoakTimerRef = useRef(null);
  const healthSoakBaselineRef = useRef(null);
  const healthSoakContextRef = useRef({});

  useEffect(() => {
    healthSoakContextRef.current = {
      currentSong,
      isPlaying,
      audioRef,
      audioContextRef,
      masterTelemetryRef,
      stereoTelemetryRef,
      sourceQualityTelemetryRef,
      multibandStereoTelemetryRef,
      uiFps
    };
  }, [
    currentSong,
    isPlaying,
    audioRef,
    audioContextRef,
    masterTelemetryRef,
    stereoTelemetryRef,
    sourceQualityTelemetryRef,
    multibandStereoTelemetryRef,
    uiFps
  ]);

  useEffect(() => () => {
    if (healthSoakTimerRef.current) {
      clearInterval(healthSoakTimerRef.current);
    }
  }, []);

  const captureHealthSnapshot = () => createHealthSnapshot({
    currentSong,
    isPlaying,
    audioRef,
    audioContextRef,
    masterTelemetryRef,
    stereoTelemetryRef,
    sourceQualityTelemetryRef,
    multibandStereoTelemetryRef,
    uiFps,
    activeJobs: null,
    activeDownloads: null
  });

  const handleCaptureHealthSnapshot = () => {
    const snapshot = captureHealthSnapshot();
    setHealthSnapshot(snapshot);
  };

  const handleExportHealthSnapshot = () => {
    if (!healthSnapshot) return;
    downloadJsonReport(healthSnapshot, 'player-health-snapshot');
  };

  const stopHealthSoak = (cancelled = false) => {
    if (healthSoakTimerRef.current) {
      clearInterval(healthSoakTimerRef.current);
      healthSoakTimerRef.current = null;
    }

    setHealthSoak(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        running: false,
        cancelled,
        endedAt: new Date().toISOString()
      };
    });
  };

  const handleStartHealthSoak = (durationMin) => {
    if (healthSoakTimerRef.current) {
      clearInterval(healthSoakTimerRef.current);
    }

    const startedAt = new Date().toISOString();
    const firstSnapshot = captureHealthSnapshot();
    healthSoakBaselineRef.current = firstSnapshot;
    setHealthSoak({
      running: true,
      cancelled: false,
      durationMin,
      startedAt,
      endedAt: null,
      snapshots: [firstSnapshot],
      alerts: [],
      lastRisk: firstSnapshot.performance.governorRisk || 'UNKNOWN'
    });

    healthSoakTimerRef.current = setInterval(() => {
      setHealthSoak(prev => {
        if (!prev?.running) return prev;

        const ctx = healthSoakContextRef.current;
        const snapshot = createHealthSnapshot({
          ...ctx,
          activeJobs: null,
          activeDownloads: null
        });
        const previousSnapshot = prev.snapshots[prev.snapshots.length - 1] || null;
        const newAlerts = evaluateHealthAlerts(snapshot, healthSoakBaselineRef.current, previousSnapshot);
        const elapsedMs = Date.now() - Date.parse(prev.startedAt);
        const shouldFinish = elapsedMs >= durationMin * 60 * 1000;
        const snapshots = [...prev.snapshots, snapshot].slice(-durationMin);

        if (shouldFinish && healthSoakTimerRef.current) {
          clearInterval(healthSoakTimerRef.current);
          healthSoakTimerRef.current = null;
        }

        return {
          ...prev,
          running: !shouldFinish,
          endedAt: shouldFinish ? new Date().toISOString() : prev.endedAt,
          snapshots,
          alerts: [...prev.alerts, ...newAlerts].slice(-120),
          lastRisk: snapshot.performance.governorRisk || 'UNKNOWN'
        };
      });
    }, 60000);
  };

  const handleExportHealthSoak = () => {
    if (!healthSoak) return;
    const report = createHealthSoakReport({
      durationMin: healthSoak.durationMin,
      startedAt: healthSoak.startedAt,
      endedAt: healthSoak.endedAt || new Date().toISOString(),
      cancelled: healthSoak.cancelled,
      snapshots: healthSoak.snapshots,
      alerts: healthSoak.alerts
    });
    downloadJsonReport(report, 'player-health-soak-test');
  };

  const handleRunSoakTest = async (durationMin) => {
    setIsSoakTesting(true);
    setSoakProgress(`Inicializando Soak Test (${durationMin} min)...`);
    try {
      const res = await runDspSoakTest(durationMin, setSoakProgress);
      setSoakResult(res);
    } catch (err) {
      setSoakResult({
        name: "DSP Soak Test",
        durationMin,
        minHealthScore: 0,
        maxCpuMs: "0.00",
        maxLimiterGR: "0.0",
        clips: 0,
        underruns: 0,
        safeBypassEvents: 0,
        governorEvents: 0,
        result: "FAIL",
        error: String(err)
      });
    } finally {
      setIsSoakTesting(false);
      setSoakProgress('');
    }
  };

  const handleRunTests = async (suiteKey) => {
    setIsTesting(true);
    setTestStatus('Inicializando testes...');
    const results = [];
    const testsToRun = TEST_SUITES[suiteKey];
    
    for (const test of testsToRun) {
      setTestStatus(`Testando: ${test.name}`);
      try {
        const res = await runAudioTest(test, setTestStatus);
        results.push(res);
      } catch (err) {
        results.push({ name: test.name, result: "ERROR", error: String(err) });
      }
    }
    
    setTestResults(results);
    setIsTesting(false);
    setTestStatus('');
  };

  // ---- Inspect all nodes ------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;

    const checkNodes = () => {
      const ctx = audioContextRef?.current;
      const results = [
        {
          label: 'AudioContext',
          ok: !!ctx,
          detail: ctx ? `state: ${ctx.state} | sr: ${ctx.sampleRate}Hz | Last resume: ${lastResumeStatusRef?.current || 'PENDING'}` : 'not initialized',
          icon: 'ctx',
        },
        {
          label: 'Source Quality (Worklet)',
          ok: !!sourceQualityRef?.current,
          detail: sourceQualityRef?.current
            ? 'Analisador de Qualidade Inicializado'
            : 'não inicializado',
          icon: 'sq',
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
          label: 'MasterOut (Worklet)',
          ok: !!truePeakNodeRef?.current,
          detail: masterTelemetryRef?.current?.safeBypassActive
            ? 'SAFE BYPASS (Proteção Ativa)'
            : (truePeakNodeRef?.current ? 'Processador True Peak Ativo' : 'não inicializado'),
          icon: 'tp',
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
      workletAnchorRef, eqFiltersRef, sourceQualityRef, lastResumeStatusRef, masterTelemetryRef]);

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
        if (masterTelemetryRef.current.truePeakMode !== undefined) {
          setTruePeakMode(masterTelemetryRef.current.truePeakMode);
        }
      }
      if (sourceQualityTelemetryRef?.current) {
        setSourceTelemetry({ ...sourceQualityTelemetryRef.current });
      }
      if (multibandStereoTelemetryRef?.current) {
        setMultibandTelemetry({ ...multibandStereoTelemetryRef.current });
      }
    }, 200);
    return () => clearInterval(interval);
  }, [isOpen, masterTelemetryRef, sourceQualityTelemetryRef, multibandStereoTelemetryRef]);

  // ---- Stereo Vectorscope / Goniometer -----------------------------------
  useEffect(() => {
    if (!isOpen || !vectorCanvasRef.current) return;
    const canvas = vectorCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let frameCount = 0;
    let lastDrawTime = 0;

    const drawVectorscope = () => {
      raf = requestAnimationFrame(drawVectorscope);
      
      const mTele = masterTelemetryRef?.current;
      const risk = mTele?.governorRisk || "LOW";
      let step = 1;
      if (risk === "CRITICAL") {
        step = 16;
      } else if (risk === "MEDIUM") {
        step = 8;
      }

      const fpsLimit = risk === "CRITICAL" ? 15 : (risk === "MEDIUM" ? 30 : 60);
      const frameInterval = 1000 / fpsLimit;
      const now = performance.now();
      if (now - lastDrawTime < frameInterval - 1) {
        return;
      }
      lastDrawTime = now;
      
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

        for (let i = 0; i < tele.points.length; i += step) {
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
  }, [isOpen, stereoTelemetryRef, activeTab]);

  // Canvas unificado (Espectro + Curva)

  // ---- Damping Curve Visualizer ------------------------------------------
  useEffect(() => {
    if (!isOpen || !curveCanvasRef.current) return;
    const canvas = curveCanvasRef.current;
    const ctx = canvas.getContext('2d');
    let raf;
    let lastDrawTime = 0;

    const drawCurve = () => {
      raf = requestAnimationFrame(drawCurve);
      
      const mTele = masterTelemetryRef?.current;
      const risk = mTele?.governorRisk || "LOW";

      const fpsLimit = risk === "CRITICAL" ? 15 : (risk === "MEDIUM" ? 30 : 60);
      const frameInterval = 1000 / fpsLimit;
      const now = performance.now();
      if (now - lastDrawTime < frameInterval - 1) {
        return;
      }
      lastDrawTime = now;

      const hpf = wetHpfRef?.current;
      const lpf = wetLpfRef?.current;
      const mid = wetMidEqRef?.current;
      const high = wetHighEqRef?.current;
      
      if (!hpf || !lpf || !mid || !high) {
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
  }, [isOpen, wetHpfRef, wetLpfRef, wetMidEqRef, wetHighEqRef, analyserRef, activeTab]);

  // ---- Quality Score Calculation -----------------------------------------
  const getQualityScore = () => {
    let score = 100;
    const reasons = [];

    const clipCount = (masterTelemetry?.clipCount || 0) + (sourceTelemetry?.sourceClipCount || 0);
    if (clipCount > 0) {
      score -= 30;
      reasons.push("Detecção de Clipping (Saturação Digital)");
    }

    const corrVal = vectorMetrics.correlation;
    if (corrVal < 0) {
      score -= 20;
      reasons.push("Correlação Negativa (Sinais L/R fora de fase)");
    }

    const limiterGR = masterTelemetry?.limiterReductionDb ? parseFloat(masterTelemetry.limiterReductionDb) : 0;
    if (limiterGR > 6) {
      score -= 10;
      reasons.push("Limiter Ativo com redução pesada (> 6dB de GR)");
    }

    const truePeakDb = masterTelemetry?.truePeakDb ? parseFloat(masterTelemetry.truePeakDb) : -100;
    if (truePeakDb > -0.3) {
      score -= 10;
      reasons.push("True Peak quente com risco de distorção (> -0.3dB)");
    }

    const widthPercent = vectorMetrics.width;
    if (widthPercent > 120) {
      score -= 10;
      reasons.push("Espacialidade excessiva (> 120%)");
    }

    // Deduções de Performance e Sobrevivência
    if (masterTelemetry?.safeBypassActive) {
      score -= 40;
      reasons.push("Crash Guard: Safe Bypass ativo (MasterOut em modo de sobrevivência)");
    }

    if (masterTelemetry?.governorActive) {
      score -= 10;
      reasons.push("Performance Governor: Proteção de CPU ativa (DSP secundário em bypass temporário)");
    }

    const recentUnderruns = masterTelemetry?.recentUnderruns ? parseInt(masterTelemetry.recentUnderruns) : 0;
    if (recentUnderruns > 0) {
      const ded = Math.min(25, 5 * recentUnderruns);
      score -= ded;
      reasons.push(`Dropouts recentes nos últimos 10s (${recentUnderruns} estalos/atrasos)`);
    }

    const cpuMsVal = masterTelemetry?.avgCpuMs ? parseFloat(masterTelemetry.avgCpuMs) : 0;
    if (cpuMsVal > 2.5) {
      score -= 15;
      reasons.push(`Latência crítica de processamento DSP (${cpuMsVal.toFixed(3)} ms)`);
    }

    const governorRisk = masterTelemetry?.governorRisk || "LOW";
    if (uiFps < 30 && !isWarmupRef.current && governorRisk !== "LOW") {
      score -= 5;
      reasons.push(`Taxa de quadros da UI reduzida (${uiFps} FPS)`);
    }

    if (isNaN(score) || !isFinite(score)) {
      score = 0;
      reasons.push("Instabilidade Numérica Detectada");
    }

    score = Math.max(0, score);

    // Suavização do score
    smoothScoreRef.current = smoothScoreRef.current * 0.9 + score * 0.1;
    const finalScore = Math.round(smoothScoreRef.current);

    // Classificação visual de qualidade
    // 95 ~ 100: EXCELLENT (GREEN)
    // 85 ~ 94: GOOD (GREENish/light GREEN)
    // 70 ~ 84: WARNING (YELLOW)
    // 50 ~ 69: DEGRADED (ORANGE)
    // < 50: CRITICAL (RED)
    let safety = "GREEN";
    let classification = "EXCELLENT";
    let classificationColor = "text-emerald-400";
    
    if (finalScore >= 95) {
      safety = "GREEN";
      classification = "EXCELLENT";
      classificationColor = "text-emerald-400";
    } else if (finalScore >= 85) {
      safety = "GREEN";
      classification = "GOOD";
      classificationColor = "text-green-400";
    } else if (finalScore >= 70) {
      safety = "YELLOW";
      classification = "WARNING";
      classificationColor = "text-amber-400";
    } else if (finalScore >= 50) {
      safety = "YELLOW";
      classification = "DEGRADED";
      classificationColor = "text-orange-400";
    } else {
      safety = "RED";
      classification = "CRITICAL";
      classificationColor = "text-rose-400 font-bold";
    }

    return { score: finalScore, safety, reasons, classification, classificationColor };
  };

  // ---- Export Report ----------------------------------------------------
  const handleExportReport = () => {
    const scoreInfo = getQualityScore();
    const report = {
      timestamp: new Date().toISOString(),
      audioContextState: audioContextRef?.current?.state || 'not initialized',
      qualityScore: scoreInfo.score,
      safety: scoreInfo.safety,
      classification: scoreInfo.classification,
      deductions: scoreInfo.reasons,
      masterTelemetry: masterTelemetry || {},
      sourceTelemetry: sourceTelemetry || {},
      multibandTelemetry: multibandTelemetry || {},
      vectorMetrics: vectorMetrics,
      activeNodes: nodes.map(n => ({ label: n.label, ok: n.ok, detail: n.detail }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audio-diagnostics-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSoakReport = () => {
    if (!soakResult) return;
    const blob = new Blob([JSON.stringify(soakResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dsp-soak-test-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ---- Auto-Tuner presets -----------------------------------------------
  const applyPresetTuning = (preset) => {
    const profile = AUTO_CALIBRATION_PROFILES[preset];
    if (!profile) return;

    setActiveProfile(preset);
    setCalibStatus('Ajustando...');
    setCalibTelemetry(null);

    // 1. Aplicar parâmetros do perfil via setters
    if (profile.eqGains !== undefined && setEqGains) setEqGains(profile.eqGains);
    if (profile.stereoWidth !== undefined && setStereoWidth) setStereoWidth(profile.stereoWidth);
    if (profile.bassEnhancer !== undefined && setBassEnhancer) setBassEnhancer(profile.bassEnhancer);
    if (profile.bassIntensity !== undefined && setBassIntensity) setBassIntensity(profile.bassIntensity);
    if (profile.spatialMode !== undefined && setSpatialMode) setSpatialMode(profile.spatialMode);
    if (profile.reverbMix !== undefined && setReverbMix) setReverbMix(profile.reverbMix);
    if (profile.harmonicExciter !== undefined && setHarmonicExciter) setHarmonicExciter(profile.harmonicExciter);
    if (profile.enableDeesser !== undefined && setEnableDeesser) setEnableDeesser(profile.enableDeesser);
    if (profile.enableDeharsh !== undefined && setEnableDeharsh) setEnableDeharsh(profile.enableDeharsh);
    if (profile.enableSaturation !== undefined && setEnableSaturation) setEnableSaturation(profile.enableSaturation);
    if (profile.satDrive !== undefined && setSatDrive) setSatDrive(profile.satDrive);
    if (profile.satMix !== undefined && setSatMix) setSatMix(profile.satMix);
    if (setSaturationOutputTrimDb) setSaturationOutputTrimDb(profile.saturationOutputTrimDb || 0);
    if (profile.satMode !== undefined && setSatMode) setSatMode(profile.satMode);
    if (profile.enableStereoDepth !== undefined && setEnableStereoDepth) setEnableStereoDepth(profile.enableStereoDepth);
    if (profile.stereoDepthAmount !== undefined && setStereoDepthAmount) setStereoDepthAmount(profile.stereoDepthAmount);
    if (profile.enable8D !== undefined && setEnable8D) setEnable8D(profile.enable8D);
    if (profile.enableTransient !== undefined && setEnableTransient) setEnableTransient(profile.enableTransient);
    if (profile.wetHpfHz !== undefined && wetHpfRef?.current && audioContextRef?.current) {
      wetHpfRef.current.frequency.setTargetAtTime(profile.wetHpfHz, audioContextRef.current.currentTime, 0.05);
    }

    // Enviar mensagem subMono para o worklet de largura multibanda
    if (stereoWidthRef?.current) {
      stereoWidthRef.current.port.postMessage({ subMono: profile.subMono });
    }

    // 2. Definir headroom extra antes (com makeup inicial em 0)
    if (setAutoCalibProfile) {
      setAutoCalibProfile({
        id: profile.id,
        name: profile.label,
        extraHeadroomDb: profile.extraHeadroomDb,
        makeupDb: 0.0
      });
    }

    // 3. Aguardar o processamento e medir o peak para cálculo do makeup gain seguro
    setTimeout(() => {
      const peakDb = masterTelemetryRef?.current?.peakPreMasterDb !== undefined 
        ? parseFloat(masterTelemetryRef.current.peakPreMasterDb) 
        : -12.0;
      const limiterGR = masterTelemetryRef?.current?.limiterReductionDb !== undefined 
        ? parseFloat(masterTelemetryRef.current.limiterReductionDb) 
        : 0.0;

      // Implement Peak Guard check before makeup
      const targetPeakDb = -2.0;
      const dangerMarginDb = 0.8;
      
      const initialGain = calculateAnticipativeHeadroom(
        profile,
        peakDb - profile.extraHeadroomDb,
        0,
        targetPeakDb,
        dangerMarginDb
      );
      let profileExtraHeadroomDb = initialGain.effectiveExtraHeadroomDb;
      let makeupDb = initialGain.makeupDb;

      if (peakDb <= targetPeakDb) {
        // Aplicar makeup apenas se peak estiver abaixo de -0.5dB e sem compressão ativa
        if (peakDb < -0.5 && limiterGR === 0.0) {
          makeupDb = Math.max(0.0, Math.min(profile.maxMakeupDb, -0.5 - peakDb));
        }
      }

      // Atualizar o perfil com o makeup gain calculado
      if (setAutoCalibProfile) {
        setAutoCalibProfile({
          id: profile.id,
          name: profile.label,
          extraHeadroomDb: profileExtraHeadroomDb,
          makeupDb: makeupDb
        });
      }

      // 4. Aguardar um pouco para a compensação de ganho surtir efeito e fazer a leitura final
      setTimeout(() => {
        const finalPeakDb = masterTelemetryRef?.current?.peakDb !== undefined 
          ? parseFloat(masterTelemetryRef.current.peakDb) 
          : -6.0;
        const finalPreMasterPeakDb = masterTelemetryRef?.current?.peakPreMasterDb !== undefined
          ? parseFloat(masterTelemetryRef.current.peakPreMasterDb)
          : finalPeakDb;
        const finalLimiterGR = masterTelemetryRef?.current?.limiterReductionDb !== undefined 
          ? parseFloat(masterTelemetryRef.current.limiterReductionDb) 
          : 0.0;
        const finalClipCount = masterTelemetryRef?.current?.clipCount || 0;

        // Ler a correlação de graves do multibandStereoTelemetryRef
        const lowCorr = multibandStereoTelemetryRef?.current?.lowCorr !== undefined
          ? parseFloat(multibandStereoTelemetryRef.current.lowCorr)
          : 1.0;
        const lowWidthStr = multibandStereoTelemetryRef?.current?.lowWidth || "0%";
        const lowWidth = parseFloat(lowWidthStr.replace("%", "")) / 100;
        const finalBassMonoSafe = multibandStereoTelemetryRef?.current?.bassMonoSafe !== false;

        // Classificar o status final da calibração
        let finalStatus = "OK";
        if (finalClipCount > 0 || finalLimiterGR > 3.0 || finalPreMasterPeakDb > -1.5 || finalPeakDb > -1.0) {
          finalStatus = "Limiter Hot";
        } else if (lowCorr < 0.20 || lowWidth > 0.60 || !finalBassMonoSafe) {
          finalStatus = "Bass Phase Risk";
        } else if (finalPeakDb < -8.0) {
          finalStatus = "Too Quiet";
        }

        setCalibStatus(finalStatus);

        const calibTele = {
          type: "telemetry",
          name: "AutoCalibration",
          profile: profile.label,
          extraHeadroomDb: profileExtraHeadroomDb.toFixed(1),
          maxBoostDb: profile.maxMakeupDb.toFixed(1),
          makeupDb: makeupDb.toFixed(1),
          peakBeforeDb: peakDb.toFixed(1),
          peakPreMasterDb: finalPreMasterPeakDb.toFixed(1),
          peakAfterDb: finalPeakDb.toFixed(1),
          limiterGR: finalLimiterGR.toFixed(1),
          clipCount: finalClipCount,
          bassMonoSafe: finalBassMonoSafe,
          status: finalStatus
        };

        setCalibTelemetry(calibTele);

        // Enviar os logs para o backend
        logToCMD("DSP-AutoCalibration", JSON.stringify(calibTele), finalStatus === "OK" ? "success" : "warn");

      }, 350);

    }, 500);
  };

  const handleTruePeakModeChange = (mode) => {
    setTruePeakMode(mode);
    if (truePeakNodeRef?.current) {
      truePeakNodeRef.current.port.postMessage({ truePeakMode: mode });
    }
  };

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
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-on-surface-variant">
                    {allOk}/{allTotal} nós ativos
                  </span>
                  <span className="text-on-surface-variant/30">•</span>
                  <button onClick={handleExportReport} className="text-[10px] font-bold text-primary hover:underline uppercase tracking-wider">
                    Exportar Relatório
                  </button>
                </div>
              </div>
            </div>
            <button onClick={onClose} className="text-on-surface-variant hover:text-error transition-colors">
              <X size={20} />
            </button>
          </div>
          {/* Tabs Bar */}
          <div className="flex border-b border-outline-variant/15 px-6 bg-surface/85 backdrop-blur sticky top-[77px] z-10 gap-4">
            {[
              { id: 'painel', label: 'Painel', icon: Sliders },
              { id: 'visualizadores', label: 'Visualizadores', icon: Activity },
              { id: 'multibanda', label: 'Multibanda', icon: Radio },
              { id: 'fonte', label: 'Fonte', icon: FileSearch },
              { id: 'testes', label: 'Testes', icon: ShieldAlert }
            ].map(tab => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-3 px-1 border-b-2 font-bold text-xs uppercase tracking-wider transition-all relative ${
                    active 
                      ? 'border-primary text-primary' 
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                  {active && (
                    <motion.div
                      layoutId="activeTabIndicator"
                      className="absolute bottom-[-2px] left-0 right-0 h-[2px] bg-primary"
                    />
                  )}
                </button>
              );
            })}
          </div>

          <div className="p-6 space-y-6">
            {activeTab === 'painel' && (
              <>
                {/* DSP Performance Monitor Dashboard */}
                {(() => {
                  const cpuLoadVal = masterTelemetry?.cpuLoad ? parseFloat(masterTelemetry.cpuLoad) : 0;
                  const avgCpuMsVal = masterTelemetry?.avgCpuMs ? parseFloat(masterTelemetry.avgCpuMs) : 0;
                  const underrunsVal = masterTelemetry?.underruns ? parseInt(masterTelemetry.underruns) : 0;
                  const recentUnderrunsVal = masterTelemetry?.recentUnderruns ? parseInt(masterTelemetry.recentUnderruns) : 0;
                  const activeNodesCount = nodes.filter(n => n.ok && n.label !== 'AudioContext').length;
                  const riskInfo = getDropoutRisk(avgCpuMsVal, recentUnderrunsVal);
                  
                  // Color coding for CPU Load & Block Time
                  let loadProgressColor = 'bg-emerald-500';
                  if (cpuLoadVal > 80) {
                    loadProgressColor = 'bg-rose-500';
                  } else if (cpuLoadVal > 40) {
                    loadProgressColor = 'bg-amber-500';
                  }

                  return (
                    <div className="p-5 rounded-2xl border bg-surface-container border-outline-variant/20 space-y-4">
                      <div className="flex justify-between items-center flex-wrap gap-2">
                        <div>
                          <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold tracking-wider">DSP Performance Monitor</p>
                          <h4 className="text-sm font-bold text-on-surface mt-1 flex items-center gap-1.5">
                            <Activity size={14} className="text-primary animate-pulse" /> Estado do Motor de Áudio
                          </h4>
                        </div>
                        <div className="flex flex-wrap gap-2 justify-end">
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                            uiFps >= 45 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                            uiFps >= 25 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                            'text-rose-400 bg-rose-500/10 border-rose-500/20'
                          }`}>
                            UI: {uiFps} FPS ({uiFps >= 45 ? 'EXCELENTE' : uiFps >= 25 ? 'ALERTA' : 'LENTO'})
                          </span>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                            avgCpuMsVal > 2.5 ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
                            avgCpuMsVal > 1.8 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                            'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          }`}>
                            DSP CPU: {avgCpuMsVal > 2.5 ? 'CRÍTICO' : avgCpuMsVal > 1.8 ? 'MÉDIO' : 'BAIXO'}
                          </span>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${riskInfo.color}`}>
                            Risco Dropout: {riskInfo.label}
                          </span>
                        </div>
                      </div>

                      {/* Performance Grid Metrics */}
                      <div className="grid grid-cols-3 gap-3">
                        {/* Block Processing Time */}
                        <div className="p-3 rounded-xl bg-background/40 border border-outline-variant/10">
                          <p className="text-[9px] uppercase font-bold text-on-surface-variant/60 flex items-center justify-between">
                            <span>Tempo de Bloco</span>
                            <span className="text-[8px] opacity-50 font-normal">{masterTelemetry?.cpuTimingQuality || "HIGH RES"}</span>
                          </p>
                          <p className="text-lg font-extrabold text-on-surface mt-1 font-mono">
                            {avgCpuMsVal.toFixed(3)}<span className="text-xs font-normal text-on-surface-variant"> ms</span>
                          </p>
                          <p className="text-[9px] text-on-surface-variant mt-0.5">limite: 2.90ms (128 samples)</p>
                        </div>

                        {/* CPU / DSP Load */}
                        <div className="p-3 rounded-xl bg-background/40 border border-outline-variant/10">
                          <p className="text-[9px] uppercase font-bold text-on-surface-variant/60">Carga do DSP</p>
                          <p className="text-lg font-extrabold text-on-surface mt-1 font-mono">
                            {cpuLoadVal.toFixed(1)}<span className="text-xs font-normal text-on-surface-variant"> %</span>
                          </p>
                          {/* Mini Progress Bar */}
                          <div className="w-full bg-background/60 h-1 rounded-full mt-2 overflow-hidden">
                            <div className={`h-full ${loadProgressColor} transition-all duration-300`} style={{ width: `${Math.min(100, cpuLoadVal)}%` }}></div>
                          </div>
                        </div>

                        {/* Active Nodes / Dropped Buffers */}
                        <div className="p-3 rounded-xl bg-background/40 border border-outline-variant/10">
                          <p className="text-[9px] uppercase font-bold text-on-surface-variant/60">Nós Ativos / Dropouts</p>
                          <p className="text-lg font-extrabold text-on-surface mt-1 font-mono">
                            {activeNodesCount} <span className="text-xs font-normal text-on-surface-variant">nós</span>
                            <span className="text-on-surface-variant/40 mx-1">/</span>
                            <span className={recentUnderrunsVal > 0 ? "text-rose-400 animate-pulse font-bold" : "text-on-surface-variant"}>
                              {recentUnderrunsVal}
                            </span>
                            <span className="text-xs text-on-surface-variant/60 font-normal ml-1 animate-none" title="Total da sessão">
                              ({underrunsVal} total)
                            </span>
                          </p>
                          <p className="text-[9px] text-on-surface-variant mt-0.5">Janela 10s / Total sessão</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* DSP Health Score Dashboard */}
                {(() => {
                  const { score, safety, reasons, classification, classificationColor } = getQualityScore();
                  const clipCount = (masterTelemetry?.clipCount || 0) + (sourceTelemetry?.sourceClipCount || 0);
                  const corrVal = vectorMetrics.correlation;
                  const limiterGR = masterTelemetry?.limiterReductionDb ? parseFloat(masterTelemetry.limiterReductionDb) : 0;
                  const cpuMsVal = masterTelemetry?.avgCpuMs ? parseFloat(masterTelemetry.avgCpuMs) : 0;
                  const governorRisk = masterTelemetry?.governorRisk || "LOW";
                  const safeBypass = masterTelemetry?.safeBypassActive || false;
                  
                  return (
                    <div className={`p-5 rounded-2xl border ${
                      safety === 'GREEN' ? 'bg-emerald-500/5 border-emerald-500/20' :
                      safety === 'YELLOW' ? 'bg-amber-500/5 border-amber-500/20' :
                      'bg-rose-500/5 border-rose-500/20'
                    }`}>
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold tracking-wider">DSP Health Monitor</p>
                          <h3 className="text-xl font-extrabold text-on-surface mt-1 flex items-baseline gap-1.5">
                            Audio Health: <span className={
                              safety === 'GREEN' ? 'text-emerald-400' :
                              safety === 'YELLOW' ? 'text-amber-400' :
                              'text-rose-400 font-bold'
                            }>{score}/100</span>
                            <span className="text-sm font-normal text-on-surface-variant/40 mx-1">—</span>
                            <span className={`text-sm font-extrabold tracking-wider ${classificationColor}`}>{classification}</span>
                          </h3>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                          classification === 'EXCELLENT' ? 'bg-emerald-500/20 text-emerald-400' :
                          classification === 'GOOD' ? 'bg-green-500/20 text-green-400' :
                          classification === 'WARNING' ? 'bg-amber-500/20 text-amber-400' :
                          classification === 'DEGRADED' ? 'bg-orange-500/20 text-orange-400' :
                          'bg-rose-500/20 text-rose-400'
                        }`}>
                          {classification}
                        </span>
                      </div>

                      {/* Single line summarizing engine health factors */}
                      <div className="p-3 rounded-xl bg-background/50 border border-outline-variant/10 text-[11px] font-mono flex flex-wrap gap-x-4 gap-y-1 justify-between">
                        <div className="flex items-center gap-1">
                          <span className="text-on-surface-variant">Clips:</span>
                          <span className={clipCount > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}>
                            {clipCount}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-on-surface-variant">Phase:</span>
                          <span className={corrVal < 0 ? 'text-rose-400 font-bold animate-pulse' : 'text-emerald-400'}>
                            {corrVal >= 0 ? 'OK' : 'Phase Cancel'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-on-surface-variant">CPU:</span>
                          <span className={
                            governorRisk === 'CRITICAL' ? 'text-rose-400 font-bold' :
                            governorRisk === 'MEDIUM' ? 'text-amber-400' : 'text-emerald-400'
                          }>
                            {cpuMsVal > 0 ? `${cpuMsVal.toFixed(2)}ms` : 'LOW'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-on-surface-variant">Bypass:</span>
                          <span className={safeBypass ? 'text-rose-400 font-bold animate-pulse' : 'text-emerald-400'}>
                            {safeBypass ? 'ACTIVE' : 'OFF'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-on-surface-variant">Limiter:</span>
                          <span className={limiterGR > 1 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                            {limiterGR > 0 ? `-${limiterGR.toFixed(1)}dB` : 'OK'}
                          </span>
                        </div>
                      </div>

                      {reasons.length > 0 ? (
                        <div className="space-y-1 mt-4">
                          <p className="text-[10px] uppercase font-bold text-rose-400 tracking-wider">Status das Deduções:</p>
                          {reasons.map((r, idx) => (
                            <div key={idx} className="text-[11px] text-on-surface-variant flex items-start gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0 mt-1" />
                              <span className="leading-tight">{r}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 mt-3">
                          <Check size={14} className="text-primary" /> Cadeia de áudio operando com integridade máxima (100% limpa).
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Node Status List */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 flex items-center gap-1">
                    <Cpu size={10} /> Status dos Nós da Chain
                  </p>
                  <div className="space-y-2">
                    {nodes.map((node, i) => {
                      const isMasterBypass = node.label === 'MasterOut (Worklet)' && masterTelemetry?.safeBypassActive;
                      return (
                        <motion.div
                          key={node.label}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className={`flex items-center gap-3 p-3 rounded-xl border ${
                            isMasterBypass
                              ? 'bg-amber-500/5 border-amber-500/20'
                              : (node.ok
                                  ? 'bg-primary/5 border-primary/20'
                                  : 'bg-error/5 border-error/20')
                          }`}
                        >
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isMasterBypass
                              ? 'bg-amber-500/15'
                              : (node.ok ? 'bg-primary/15' : 'bg-error/15')
                          }`}>
                            {isMasterBypass ? (
                              <AlertTriangle size={14} className="text-amber-400" />
                            ) : (
                              node.ok
                                ? <Check size={14} className="text-primary" />
                                : <AlertTriangle size={14} className="text-error" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-on-surface">{node.label}</p>
                            <p className="text-[10px] text-on-surface-variant truncate">{node.detail}</p>
                          </div>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                            isMasterBypass
                              ? 'bg-amber-500/20 text-amber-400'
                              : (node.ok ? 'bg-primary/20 text-primary' : 'bg-error/20 text-error')
                          }`}>
                            {isMasterBypass ? 'BYPASS' : (node.ok ? 'OK' : 'INATIVO')}
                          </span>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                {/* Calibration & Limiter Controls */}
                <div className="grid grid-cols-2 gap-4 border-t border-outline-variant/20 pt-4">
                  {/* Preset Auto-Tuner */}
                  <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/20 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 flex items-center gap-1.5">
                      <Sliders size={12} className="text-primary" /> Auto-Calibração
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.keys(AUTO_CALIBRATION_PROFILES).map((key) => (
                        <M3Chip
                          key={key}
                          label={AUTO_CALIBRATION_PROFILES[key].label}
                          selected={activeProfile === key}
                          onClick={() => applyPresetTuning(key)}
                        />
                      ))}
                    </div>
                    {activeProfile && (
                      <div className="mt-2 p-2.5 rounded-xl bg-background/60 border border-outline-variant/15 text-[10px] space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant">Perfil:</span>
                          <span className="font-bold text-primary uppercase">{AUTO_CALIBRATION_PROFILES[activeProfile]?.label || activeProfile}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-on-surface-variant">Status Calib:</span>
                          <span className={`font-bold uppercase ${
                            calibStatus === 'OK' ? 'text-emerald-400' :
                            calibStatus === 'Ajustando...' ? 'text-amber-400 animate-pulse' :
                            calibStatus === 'Limiter Hot' ? 'text-rose-400' :
                            calibStatus === 'Bass Phase Risk' ? 'text-amber-400' :
                            'text-on-surface-variant'
                          }`}>{calibStatus}</span>
                        </div>
                        {calibTelemetry && (
                          <div className="pt-1 mt-1 border-t border-outline-variant/10 grid grid-cols-2 gap-x-2 gap-y-0.5 text-on-surface-variant/80 font-mono">
                            <div>HR: <span className="text-on-surface">{calibTelemetry.extraHeadroomDb}dB</span></div>
                            <div>Makeup: <span className="text-on-surface">+{calibTelemetry.makeupDb}dB</span></div>
                            <div>Peak: <span className="text-on-surface">{calibTelemetry.peakAfterDb}dB</span></div>
                            <div>GR: <span className="text-on-surface">{calibTelemetry.limiterGR}dB</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
 
                  {/* True Peak Mode Selector */}
                  <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/20 space-y-3 flex flex-col justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 flex items-center gap-1.5 mb-2">
                        <ShieldAlert size={12} className="text-primary" /> Oversampling Limiter
                      </p>
                      <p className="text-[10px] text-on-surface-variant leading-relaxed">
                        Ajuste o fator de sobreamostragem para detecção de picos inter-sample e prevenção de distorções analógicas.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[
                        [0, 'Desativado'],
                        [2, '2x (Std)'],
                        [4, '4x (High)'],
                      ].map(([modeVal, label]) => (
                        <M3Chip
                          key={modeVal}
                          label={label}
                          selected={truePeakMode === modeVal}
                          onClick={() => handleTruePeakModeChange(modeVal)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'visualizadores' && (
              <>
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

                {/* Live Meters & Master Out Box */}
                <div className="space-y-4">
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

                  {masterTelemetry?.safeBypassActive && (
                    <div className="mb-3 p-3 bg-amber-500/20 border border-amber-500/40 rounded-xl text-xs text-amber-300 flex items-center gap-2 font-bold animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      MasterOut: SAFE BYPASS ATIVO (Proteção Ativa contra Travamentos)
                    </div>
                  )}

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
              </>
            )}

            {activeTab === 'multibanda' && (
              <>
                {/* Multiband Stereo Analysis */}
                {multibandTelemetry ? (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                      <Radio size={10} /> Análise Estéreo Multibanda
                    </p>
                    <div className="grid grid-cols-3 gap-3 bg-surface-container rounded-2xl p-4 border border-outline-variant/20">
                      {/* Low Band */}
                      <div className="bg-background/40 p-3 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant/70 mb-1">Grave (0 - 150Hz)</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Width:</span>
                            <span className="font-mono font-bold text-primary">{(multibandTelemetry.lowWidth !== undefined ? parseFloat(multibandTelemetry.lowWidth) : 0).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Correlação:</span>
                            <span className={`font-mono font-bold ${(parseFloat(multibandTelemetry.lowCorr) || 0) < 0.1 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {(multibandTelemetry.lowCorr !== undefined ? parseFloat(multibandTelemetry.lowCorr) : 1.0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Mid Band */}
                      <div className="bg-background/40 p-3 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant/70 mb-1">Médio (150Hz - 4.0kHz)</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Width:</span>
                            <span className="font-mono font-bold text-primary">{(multibandTelemetry.midWidth !== undefined ? parseFloat(multibandTelemetry.midWidth) : 0).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Correlação:</span>
                            <span className={`font-mono font-bold ${(parseFloat(multibandTelemetry.midCorr) || 0) < 0.15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {(multibandTelemetry.midCorr !== undefined ? parseFloat(multibandTelemetry.midCorr) : 1.0).toFixed(2)}
                            </span>
                          </div>
                          {multibandTelemetry.governorActive && (
                            <div className="flex justify-between text-[10px] text-amber-400 font-bold mt-1 border-t border-amber-500/20 pt-1">
                              <span>Governor:</span>
                              <span>-{Math.round((1 - parseFloat(multibandTelemetry.governorScale)) * 100)}%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* High Band */}
                      <div className="bg-background/40 p-3 rounded-xl border border-outline-variant/10 flex flex-col justify-between">
                        <p className="text-[10px] uppercase font-bold text-on-surface-variant/70 mb-1">Agudo (4.0kHz+)</p>
                        <div className="space-y-1 mt-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Width:</span>
                            <span className="font-mono font-bold text-primary">{(multibandTelemetry.highWidth !== undefined ? parseFloat(multibandTelemetry.highWidth) : 0).toFixed(0)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-on-surface-variant">Correlação:</span>
                            <span className={`font-mono font-bold ${(parseFloat(multibandTelemetry.highCorr) || 0) < 0.15 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {(multibandTelemetry.highCorr !== undefined ? parseFloat(multibandTelemetry.highCorr) : 1.0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-on-surface-variant/50 text-center py-8">Carregando dados multibanda...</p>
                )}
              </>
            )}

            {activeTab === 'fonte' && (
              <div className="space-y-6">
                {!currentSong || !currentSong.file ? (
                  <div className="p-8 text-center rounded-2xl bg-surface-container border border-outline-variant/20 flex flex-col items-center justify-center space-y-4">
                    <FileAudio className="text-on-surface-variant/40" size={48} />
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-on-surface">Apenas Arquivos Locais</p>
                      <p className="text-xs text-on-surface-variant max-w-sm leading-relaxed">
                        A análise de autenticidade espectral requer um arquivo local baixado (.flac, .mp3, .wav) para rodar o FFmpeg.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Header Faixa */}
                    <div className="p-4 rounded-2xl bg-surface-container border border-outline-variant/20 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase text-on-surface-variant/60 font-bold tracking-wider">Arquivo Analisado</p>
                        <h4 className="text-xs font-mono font-bold text-on-surface truncate mt-1">{currentSong.title}</h4>
                        <p className="text-[10px] text-on-surface-variant truncate mt-0.5 font-mono">{currentSong.file}</p>
                      </div>
                      {spectralData && (
                        <button
                          onClick={handleRunSpectralAnalysis}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/30 text-[10px] font-bold text-on-surface hover:bg-surface-container-high transition-all"
                        >
                          <RefreshCw size={11} /> Reanalisar
                        </button>
                      )}
                    </div>

                    {/* Estados de Carregamento / Início */}
                    {!spectralData && !isAnalyzing && !analyzeError && (
                      <div className="p-8 text-center rounded-2xl bg-surface-container border border-outline-variant/20 flex flex-col items-center justify-center space-y-4">
                        <FileSearch className="text-primary/75" size={48} />
                        <div className="space-y-2 max-w-md">
                          <h4 className="text-sm font-bold text-on-surface">Analisador de Autenticidade Espectral</h4>
                          <p className="text-xs text-on-surface-variant leading-relaxed">
                            Muitos arquivos rotulados como "FLAC" na internet são apenas transcodes de MP3 (upscalados). O analisador verifica a frequência de corte real do arquivo para comprovar sua autenticidade.
                          </p>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleRunSpectralAnalysis}
                          className="px-5 py-2.5 rounded-full bg-primary text-on-primary font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20 hover:brightness-110 transition-all flex items-center gap-2"
                        >
                          <FileSearch size={14} /> Analisar Arquivo
                        </motion.button>
                      </div>
                    )}

                    {isAnalyzing && (
                      <div className="p-12 text-center rounded-2xl bg-surface-container border border-outline-variant/20 flex flex-col items-center justify-center space-y-4">
                        <div className="relative flex items-center justify-center w-12 h-12">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                            className="absolute inset-0 rounded-full border-2 border-primary/20 border-t-primary"
                          />
                          <FileSearch className="text-primary animate-pulse" size={20} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-on-surface">Gerando Espectrograma...</p>
                          <p className="text-[10px] text-on-surface-variant animate-pulse">FFmpeg decodificando e analisando frequências...</p>
                        </div>
                      </div>
                    )}

                    {analyzeError && (
                      <div className="p-8 text-center rounded-2xl bg-error/5 border border-error/20 flex flex-col items-center justify-center space-y-4">
                        <AlertCircle className="text-error" size={48} />
                        <div className="space-y-2 max-w-md">
                          <h4 className="text-sm font-bold text-error">Erro na Análise</h4>
                          <p className="text-xs text-on-surface-variant font-mono leading-relaxed bg-background/50 p-3 rounded-lg border border-outline-variant/10 max-h-24 overflow-y-auto">
                            {analyzeError}
                          </p>
                        </div>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={handleRunSpectralAnalysis}
                          className="px-5 py-2.5 rounded-full bg-error text-on-error font-bold text-xs uppercase tracking-wider hover:brightness-110 transition-all"
                        >
                          Tentar Novamente
                        </motion.button>
                      </div>
                    )}

                    {/* Exibição dos Resultados */}
                    {spectralData && (
                      <div className="space-y-6">
                        {/* Banner de Risco */}
                        {(() => {
                          let bg = "bg-emerald-500/5 border-emerald-500/20";
                          let text = "text-emerald-400";
                          let badgeBg = "bg-emerald-500/20 text-emerald-400";
                          let icon = <ShieldCheck className="text-emerald-400" size={20} />;
                          let title = "Fonte Lossless Autêntica";
                          let desc = "O corte espectral e a distribuição de energia indicam que este arquivo é um lossless real de alta qualidade.";

                          if (spectralData.qualityRisk === "POSSIBLE_TRANSCODE") {
                            bg = "bg-amber-500/5 border-amber-500/20";
                            text = "text-amber-400";
                            badgeBg = "bg-amber-500/20 text-amber-400";
                            icon = <AlertTriangle className="text-amber-400" size={20} />;
                            title = "Possível Transcode Lossy";
                            desc = "Frequência de corte reduzida ou corte 'brickwall' de compressão detectado. Pode ter sido gerado a partir de MP3.";
                          } else if (spectralData.qualityRisk === "LOSSY_SOURCE") {
                            bg = "bg-rose-500/5 border-rose-500/20";
                            text = "text-rose-400";
                            badgeBg = "bg-rose-500/20 text-rose-400";
                            icon = <AlertCircle className="text-rose-400" size={20} />;
                            title = "Fonte Lossy Confirmada";
                            desc = "Este arquivo de áudio apresenta um corte drástico de alta frequência. É um falso lossless (MP3 upscalado).";
                          }

                          return (
                            <div className={`p-4 rounded-2xl border ${bg} flex gap-3.5 items-start`}>
                              <div className="p-2 rounded-xl bg-background/50 shrink-0 border border-outline-variant/10">
                                {icon}
                              </div>
                              <div className="flex-1 space-y-1">
                                <div className="flex items-center justify-between">
                                  <h3 className={`font-bold text-sm ${text}`}>{title}</h3>
                                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${badgeBg}`}>
                                    Confiança: {spectralData.confidence}
                                  </span>
                                </div>
                                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                                  {desc}
                                </p>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Imagem do Espectrograma */}
                        <div className="space-y-2">
                          <p className="text-[10px] uppercase font-bold text-on-surface-variant/60 tracking-wider">Espectrograma de Frequência</p>
                          <div className="relative rounded-2xl overflow-hidden border border-outline-variant/20 bg-background shadow-inner p-1">
                            <img
                              src={`data:image/png;base64,${spectralData.spectrogram_b64}`}
                              alt="Espectrograma"
                              className="w-full h-auto object-cover rounded-xl"
                            />
                            {/* Marcador Visual de Corte */}
                            <div className="absolute left-[5%] right-[15%] bottom-5 flex flex-col justify-end pointer-events-none">
                              {/* Linha pontilhada no corte */}
                              <div className="text-[8px] font-mono text-primary/70 bg-background/80 px-2 py-0.5 rounded border border-outline-variant/10 self-start">
                                Corte: {(spectralData.spectralCutoffHz / 1000).toFixed(1)} kHz
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-between px-2 text-[9px] font-mono text-on-surface-variant/60">
                            <span>0 Hz</span>
                            <span>10 kHz</span>
                            <span>16 kHz</span>
                            <span>20 kHz</span>
                            <span>Nyquist: {(spectralData.nyquistHz / 1000).toFixed(1)} kHz</span>
                          </div>
                        </div>

                        {/* Grid de Metadados da Fonte */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Container / Codec</span>
                            <span className="text-xs font-mono font-bold text-on-surface mt-1 block">
                              {spectralData.container} / {spectralData.codec}
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Taxa de Bits</span>
                            <span className="text-xs font-mono font-bold text-on-surface mt-1 block">
                              {spectralData.bitrateKbps > 0 ? `${spectralData.bitrateKbps} kbps` : 'Variável'}
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Amostragem / Resolução</span>
                            <span className="text-xs font-mono font-bold text-on-surface mt-1 block">
                              {spectralData.sampleRate / 1000} kHz / {spectralData.bitDepth > 0 ? `${spectralData.bitDepth} bits` : 'N/A'}
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Frequência de Corte</span>
                            <span className={`text-xs font-mono font-bold mt-1 block ${
                              spectralData.spectralCutoffHz >= 20000 ? 'text-emerald-400' :
                              spectralData.spectralCutoffHz >= 16500 ? 'text-amber-400' : 'text-rose-400'
                            }`}>
                              {(spectralData.spectralCutoffHz / 1000).toFixed(1)} kHz
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Filtro Brickwall</span>
                            <span className={`text-xs font-mono font-bold mt-1 block ${spectralData.brickwallDetected ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {spectralData.brickwallDetected ? 'Sim (Perceptível)' : 'Não'}
                            </span>
                          </div>
                          <div className="p-3 rounded-xl bg-surface-container/60 border border-outline-variant/10">
                            <span className="text-[9px] uppercase font-bold text-on-surface-variant/60 block">Carga de Alta Frequência</span>
                            <span className="text-xs font-mono font-bold text-primary mt-1 block">
                              {(spectralData.highBandEnergyRatio * 100).toFixed(2)}%
                            </span>
                          </div>
                        </div>

                        {/* Explicação Técnica */}
                        <div className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant/20 text-[10px] leading-relaxed text-on-surface-variant/80 space-y-2">
                          <p className="font-bold text-on-surface">Como ler o analisador:</p>
                          <p>
                            • <strong>Lossless Real (FLAC):</strong> Apresenta nuvens suaves de frequência se estendendo acima de 20 kHz de forma fluida.
                          </p>
                          <p>
                            • <strong>Falso Lossless (Transcode):</strong> Exibe uma linha reta horizontal muito definida (brickwall) entre 16 kHz e 20 kHz, sem energia acima dessa faixa, denunciando que foi gerado de um MP3.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {activeTab === 'testes' && (
              <>
                {/* DSP Torture Test */}
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-3 flex items-center gap-1">
                    <ShieldAlert size={10} /> DSP Regression Test Suite
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    <M3Chip
                      label="Quick"
                      icon={Play}
                      onClick={() => handleRunTests('QUICK')}
                      disabled={isTesting}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="Full"
                      icon={Play}
                      onClick={() => handleRunTests('FULL')}
                      disabled={isTesting}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="Torture"
                      icon={Activity}
                      onClick={() => handleRunTests('TORTURE')}
                      disabled={isTesting}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="Auto-Calib"
                      icon={Sliders}
                      onClick={() => handleRunTests('AUTOCALIB')}
                      disabled={isTesting}
                      checkIcon={false}
                    />
                  </div>

                  {isTesting && (
                    <div className="text-center py-2 text-xs font-bold text-primary animate-pulse">
                      {testStatus}
                    </div>
                  )}

                  {testResults && !isTesting && (
                    <div className="space-y-2">
                      <div className="flex gap-2 text-xs font-bold uppercase mb-2">
                        <span className="text-green-400">PASS: {testResults.filter(r => r.result === 'PASS').length}</span>
                        <span className="text-yellow-400">WARN: {testResults.filter(r => r.result === 'WARN').length}</span>
                        <span className="text-error">FAIL: {testResults.filter(r => r.result === 'FAIL' || r.result === 'ERROR').length}</span>
                      </div>
                      {testResults.map((res, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${res.result === 'PASS' ? 'border-green-500/20 bg-green-500/5' : res.result === 'WARN' ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-error/20 bg-error/5'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-bold text-sm text-on-surface">{res.name}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-sm ${res.result === 'PASS' ? 'bg-green-500/20 text-green-400' : res.result === 'WARN' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-error/20 text-error'}`}>{res.result}</span>
                          </div>
                          
                          {/* Detailed Metrics */}
                          {res.metrics && (
                            <div className="grid grid-cols-3 gap-1 mb-2 text-[10px] font-mono">
                              {res.metrics.peakRawProfileDb != null && <div><span className="opacity-60">Peak(Raw):</span> {res.metrics.peakRawProfileDb.toFixed(1)}dB</div>}
                              {res.metrics.appliedExtraHeadroomDb != null && <div><span className="opacity-60">Headroom:</span> {res.metrics.appliedExtraHeadroomDb.toFixed(1)}dB</div>}
                              <div><span className="opacity-60">Peak(Pre-Master):</span> {res.metrics.preMasterPeakDb?.toFixed(1)}dB</div>
                              <div><span className="opacity-60">Peak(Post-Master):</span> {res.metrics.peakDb?.toFixed(1)}dB</div>
                              <div><span className="opacity-60">Clips:</span> {res.metrics.clipCount}</div>
                              <div><span className="opacity-60">Corr:</span> {res.metrics.correlation > 0 ? '+' : ''}{res.metrics.correlation?.toFixed(2)}</div>
                              <div><span className="opacity-60">Width:</span> {res.metrics.widthPercent?.toFixed(0)}%</div>
                              <div><span className="opacity-60">LimitGR:</span> {res.metrics.maxLimiterGR?.toFixed(1)}dB</div>
                              <div><span className="opacity-60">NaN:</span> {res.metrics.nanDetected ? 'true' : 'false'}</div>
                            </div>
                          )}

                          {res.failures && res.failures.length > 0 && (
                            <ul className="text-xs text-error list-disc list-inside mt-1">
                              {res.failures.map((f, j) => <li key={j}>{f}</li>)}
                            </ul>
                          )}
                          {res.warnings && res.warnings.length > 0 && (
                            <ul className="text-xs text-yellow-400 list-disc list-inside mt-1">
                              {res.warnings.map((w, j) => <li key={j}>{w}</li>)}
                            </ul>
                          )}
                          {res.error && <p className="text-xs text-error mt-1">{res.error}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Health Snapshot / Lightweight Soak Test */}
                <div className="mt-6 border-t border-outline-variant/20 pt-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                    <ShieldCheck size={10} /> Health Snapshot / Soak Test Leve
                  </p>
                  <p className="text-[10px] text-on-surface-variant/70 mb-4 leading-relaxed">
                    Captura snapshots sanitizados do player durante uso real. Nao altera DSP, presets, limiter, EQ ou cadeia de audio.
                  </p>

                  <div className="flex flex-wrap gap-2 mb-4">
                    <M3Chip
                      label="Capturar Snapshot"
                      icon={FileAudio}
                      onClick={handleCaptureHealthSnapshot}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="Exportar Snapshot"
                      icon={FileSearch}
                      onClick={handleExportHealthSnapshot}
                      disabled={!healthSnapshot}
                      checkIcon={false}
                    />
                  </div>

                  {healthSnapshot && (
                    <div className="p-3 rounded-xl border border-outline-variant/20 bg-surface-container-high/30 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-on-surface">Ultimo snapshot</span>
                        <span className="text-[10px] font-mono text-on-surface-variant">{new Date(healthSnapshot.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                        <div><span className="opacity-60">Play:</span> {healthSnapshot.player.isPlaying ? 'sim' : 'nao'}</div>
                        <div><span className="opacity-60">Ctx:</span> {healthSnapshot.player.audioContextState || 'null'}</div>
                        <div><span className="opacity-60">Peak:</span> {healthSnapshot.audio.peakDb ?? 'null'} dB</div>
                        <div><span className="opacity-60">Clips:</span> {healthSnapshot.audio.clipCount ?? 'null'}</div>
                        <div><span className="opacity-60">GR:</span> {healthSnapshot.audio.limiterReductionDb ?? 'null'} dB</div>
                        <div><span className="opacity-60">Risk:</span> {healthSnapshot.performance.governorRisk || 'null'}</div>
                        <div><span className="opacity-60">FPS:</span> {healthSnapshot.performance.uiFps ?? 'null'}</div>
                        <div><span className="opacity-60">Arquivo:</span> {healthSnapshot.song.file.fileName || 'null'}</div>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 mb-4">
                    {[5, 15, 30, 60].map((durationMin) => (
                      <M3Chip
                        key={durationMin}
                        label={`${durationMin} min`}
                        icon={Activity}
                        onClick={() => handleStartHealthSoak(durationMin)}
                        disabled={!!healthSoak?.running}
                        checkIcon={false}
                      />
                    ))}
                    <M3Chip
                      label="Cancelar"
                      icon={AlertCircle}
                      onClick={() => stopHealthSoak(true)}
                      disabled={!healthSoak?.running}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="Exportar Soak"
                      icon={FileSearch}
                      onClick={handleExportHealthSoak}
                      disabled={!healthSoak?.snapshots?.length}
                      checkIcon={false}
                    />
                  </div>

                  {healthSoak && (
                    <div className={`p-4 rounded-xl border space-y-3 ${
                      healthSoak.alerts.some(a => a.severity === 'error')
                        ? 'border-error/25 bg-error/5'
                        : healthSoak.alerts.length
                          ? 'border-amber-500/25 bg-amber-500/5'
                          : 'border-primary/20 bg-primary/5'
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-on-surface">
                            {healthSoak.running ? 'Rodando' : (healthSoak.cancelled ? 'Cancelado' : 'Concluido')} ({healthSoak.durationMin}m)
                          </p>
                          <p className="text-[10px] text-on-surface-variant">
                            {healthSoak.snapshots.length} snapshot(s) coletado(s) | risco atual: {healthSoak.lastRisk || 'UNKNOWN'}
                          </p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          healthSoak.alerts.some(a => a.severity === 'error')
                            ? 'bg-error/20 text-error'
                            : healthSoak.alerts.length
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-primary/20 text-primary'
                        }`}>
                          {healthSoak.alerts.some(a => a.severity === 'error') ? 'FAIL' : (healthSoak.alerts.length ? 'WARN' : 'OK')}
                        </span>
                      </div>

                      {healthSoak.alerts.length > 0 && (
                        <div className="space-y-1">
                          {healthSoak.alerts.slice(-5).map((alert, idx) => (
                            <div key={`${alert.type}-${idx}`} className="text-[10px] text-on-surface-variant flex items-start gap-1.5">
                              <AlertTriangle size={10} className={alert.severity === 'error' ? 'text-error mt-0.5' : 'text-amber-400 mt-0.5'} />
                              <span>{alert.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* DSP Soak Test */}
                <div className="mt-6 border-t border-outline-variant/20 pt-6">
                  <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2 flex items-center gap-1">
                    <Activity size={10} /> DSP Soak Test (Estresse de Longa Duração)
                  </p>
                  <p className="text-[10px] text-on-surface-variant/70 mb-4 leading-relaxed">
                    Simula o processador sob estresse dinâmico de longa duração de forma acelerada (em poucos segundos), alternando modos de reverb, exciter, ganho extremo, 8D espacial, doppler shift, pause/resume e troca de faixas.
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mb-4">
                    <M3Chip
                      label="10 Minutos"
                      onClick={() => handleRunSoakTest(10)}
                      disabled={isSoakTesting || isTesting}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="30 Minutos"
                      onClick={() => handleRunSoakTest(30)}
                      disabled={isSoakTesting || isTesting}
                      checkIcon={false}
                    />
                    <M3Chip
                      label="1 Hora"
                      onClick={() => handleRunSoakTest(60)}
                      disabled={isSoakTesting || isTesting}
                      checkIcon={false}
                    />
                  </div>

                  {isSoakTesting && (
                    <div className="text-center py-2 text-xs font-bold text-primary animate-pulse">
                      {soakProgress}
                    </div>
                  )}

                  {soakResult && !isSoakTesting && (
                    <div className="p-4 rounded-xl border border-outline-variant/30 bg-surface-container-high/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-on-surface">{soakResult.name} ({soakResult.durationMin}m)</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${soakResult.result === 'PASS' ? 'bg-green-500/20 text-green-400' : 'bg-error/20 text-error'}`}>
                            {soakResult.result}
                          </span>
                          <button 
                            onClick={handleExportSoakReport}
                            className="text-[10px] text-primary font-bold hover:underline uppercase"
                          >
                            Exportar JSON
                          </button>
                        </div>
                      </div>

                      {soakResult.error ? (
                        <p className="text-xs text-error">{soakResult.error}</p>
                      ) : (
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Min Health Score</span>
                            <span className={`font-bold text-sm ${
                              soakResult.minHealthScore >= 95 ? 'text-green-400' :
                              soakResult.minHealthScore >= 85 ? 'text-green-300' :
                              soakResult.minHealthScore >= 70 ? 'text-yellow-400' :
                              soakResult.minHealthScore >= 50 ? 'text-orange-400' : 'text-error'
                            }`}>{soakResult.minHealthScore}/100</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Max CPU Load</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.maxCpuMs} ms</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Max Limiter GR</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.maxLimiterGR} dB</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Total Clips</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.clips}</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Underruns</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.underruns}</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg">
                            <span className="opacity-60 block text-[9px] uppercase">Bypass de Segurança</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.safeBypassEvents}</span>
                          </div>
                          <div className="bg-surface-container/30 p-2 rounded-lg col-span-2">
                            <span className="opacity-60 block text-[9px] uppercase">Eventos do Governor</span>
                            <span className="font-bold text-sm text-on-surface">{soakResult.governorEvents}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Test Signal Guide */}
                <div className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant/20 space-y-2 mt-4">
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
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
