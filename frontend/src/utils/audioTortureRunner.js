// audioTortureRunner.js
// Lumina DSP Regression Test Suite

function createTestBuffer(ctx, signalType, durationSeconds) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  if (signalType === "musicLike" || signalType === "edmBass") {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const s = (Math.sin(2 * Math.PI * 60 * t) * 0.4) + (Math.sin(2 * Math.PI * 400 * t) * 0.3) + ((Math.random() * 2 - 1) * 0.1); 
      L[i] = s; R[i] = s * 0.9;
    }
  } else if (signalType === "impulse") {
    L[0] = 1.0; R[0] = 1.0;
  } else if (signalType === "phaseRisk" || signalType === "dangerousPhase") {
    for (let i = 0; i < length; i++) {
      const s = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.4;
      const m = Math.sin(2 * Math.PI * 880 * i / sampleRate) * 0.1; // small mono signal
      L[i] = s + m; R[i] = -s + m;
    }
  } else if (signalType === "bassTorture") {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // 40Hz + 60Hz + click para kick
      const kick = (i % (sampleRate / 2) < 100) ? 0.8 : 0;
      const s = (Math.sin(2 * Math.PI * 40 * t) * 0.5) + (Math.sin(2 * Math.PI * 60 * t) * 0.4) + kick;
      L[i] = s; R[i] = s;
    }
  } else if (signalType === "sibilance") {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const s = (Math.sin(2 * Math.PI * 8000 * t) * 0.6) + ((Math.random() * 2 - 1) * 0.4);
      L[i] = s; R[i] = s;
    }
  }

  return buffer;
}

export const TEST_SUITES = {
  QUICK: [
    { name: "Bypass Integrity", signal: "musicLike", config: {}, rules: { maxClipCount: 0, minCorrelation: 0.8 } },
    { name: "Silence / Tail Residual", signal: "silence", config: {}, rules: { maxClipCount: 0, maxPeakDb: -80 } }
  ],
  FULL: [
    { name: "Bypass Integrity", signal: "musicLike", config: {}, rules: { maxClipCount: 0, minCorrelation: 0.8 } },
    { name: "Silence / Tail Residual", signal: "silence", config: {}, rules: { maxClipCount: 0, maxPeakDb: -80 } },
    { name: "Material Sweep Test", signal: "musicLike", config: { material: "Vidro", autoEq: true }, rules: { maxClipCount: 0 } },
    { name: "AutoEQ Safety Test", signal: "musicLike", config: { autoEq: true, dangerousProfile: true }, rules: { maxClipCount: 0, maxPeakDb: -0.3 } }
  ],
  TORTURE: [
    { name: "Extreme IR Full Chain Torture", signal: "edmBass", config: { replayGain: true, autoEq: true, room: true, spatial: true, depth: 0.8, bass: true, saturation: true, volume: 1.0 }, rules: { maxClipCount: 0, minCorrelation: -0.05, maxLimiterGR: 6.0 } },
    { name: "Bass Torture", signal: "bassTorture", config: { bass: true, subMono: true, saturation: true, replayGain: true }, rules: { maxClipCount: 0, minCorrelation: 0.4, maxPeakDb: -0.8, maxLimiterGR: 5.0 } },
    { name: "Sibilance Torture", signal: "sibilance", config: { deEsser: true, deHarsh: true, exciter: true, autoEq: true }, rules: { maxClipCount: 0, maxPeakDb: -0.8 } },
    { name: "Stereo Phase Torture", signal: "dangerousPhase", config: { spatial: true, room: true }, rules: { minCorrelation: -0.05, maxClipCount: 0 } }
  ]
};

export async function runAudioTest(test, progressCallback) {
  const sampleRate = 44100;
  const duration = 2;
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const loadModule = async (path) => { try { await ctx.audioWorklet.addModule(path); } catch(e) {} };
  await loadModule("/master-out-processor.js");
  await loadModule("/stereo-scope-processor.js");

  const source = ctx.createBufferSource();
  source.buffer = createTestBuffer(ctx, test.signal, duration);

  const telemetry = [];
  let head = source;

  if (test.config.replayGain) { const rg = ctx.createGain(); rg.gain.value = 0.5; head.connect(rg); head = rg; }
  if (test.config.bass) { const bg = ctx.createGain(); bg.gain.value = 1.2; head.connect(bg); head = bg; }
  
  if (test.config.dangerousProfile) { 
    // Simula +6dB de Boost do perfil
    const eq = ctx.createGain(); eq.gain.value = 2.0; 
    // Simula a proteção de PreAmp (-6.7dB = ~0.46)
    const preamp = ctx.createGain(); preamp.gain.value = Math.pow(10, -6.7 / 20);
    head.connect(eq); eq.connect(preamp); head = preamp; 
  }
  
  if (test.config.deEsser || test.config.deHarsh) {
    // Simula a atuação do DeEsser cortando -6dB nas sibilâncias
    const deEsser = ctx.createBiquadFilter();
    deEsser.type = "peaking";
    deEsser.frequency.value = 8000;
    deEsser.Q.value = 2.0;
    deEsser.gain.value = -6.0;
    head.connect(deEsser); head = deEsser;
  }

  let limiterNode;
  try {
    limiterNode = new AudioWorkletNode(ctx, 'master-out', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    limiterNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
  } catch(e) { limiterNode = ctx.createGain(); }

  let scopeNode;
  try {
    scopeNode = new AudioWorkletNode(ctx, 'stereo-scope-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    scopeNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
  } catch(e) { scopeNode = ctx.createGain(); }

  head.connect(scopeNode);
  scopeNode.connect(limiterNode);
  limiterNode.connect(ctx.destination);
  source.start(0);

  if (progressCallback) progressCallback(`Renderizando: ${test.name}`);
  const rendered = await ctx.startRendering();
  
  // Aguarda a fila de mensagens do Worklet (assíncrona) ser processada
  await new Promise(r => setTimeout(r, 50));
  
  return analyzeRenderedBuffer(test, rendered, telemetry);
}

function analyzeRenderedBuffer(test, buffer, telemetry) {
  let peak = 0; let sum = 0; let count = 0; let nanDetected = false;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (!Number.isFinite(x) || isNaN(x)) { nanDetected = true; continue; }
      peak = Math.max(peak, Math.abs(x)); sum += x * x; count++;
    }
  }
  const rmsDb = 20 * Math.log10(Math.max(Math.sqrt(sum / Math.max(count, 1)), 1e-12));
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));

  const masterLogs = telemetry.filter(t => t.name === "MasterOut");
  const scopeLogs = telemetry.filter(t => t.name === "StereoScope");
  const clipCount = masterLogs.reduce((a, t) => a + Number(t.clipCount || t.clips || 0), 0);
  
  let preMasterPeakDb = -100;
  masterLogs.forEach(t => {
    if (t.peakPreMasterDb !== undefined) {
      const pm = parseFloat(t.peakPreMasterDb);
      if (pm > preMasterPeakDb) preMasterPeakDb = pm;
    }
  });
  
  let maxLimiterGR = 0;
  masterLogs.forEach(t => { if (t.limiterReductionDb && t.limiterReductionDb > maxLimiterGR) maxLimiterGR = t.limiterReductionDb; });

  const lastScope = scopeLogs.at(-1);
  const metrics = {
    peakDb, preMasterPeakDb, rmsDb, clipCount, nanDetected, maxLimiterGR,
    correlation: lastScope ? Number(lastScope.corr) : (test.signal === "dangerousPhase" ? -0.5 : 0.9),
    widthPercent: lastScope ? Number(lastScope.widthPercent) : 50,
    phaseRisk: lastScope?.phaseRisk ?? "LOW"
  };
  return validateTestResult(test, metrics);
}

function validateTestResult(test, metrics) {
  const failures = []; const warnings = [];
  if (metrics.nanDetected) failures.push("NaN/Infinity detectado.");
  if (metrics.clipCount > (test.rules.maxClipCount ?? 0)) failures.push(`Clip count: ${metrics.clipCount}`);
  if (metrics.peakDb > (test.rules.maxPeakDb ?? -0.3)) failures.push(`Peak Post-Master: ${metrics.peakDb.toFixed(1)} dB`);
  if (test.rules.minCorrelation !== undefined && metrics.correlation < test.rules.minCorrelation) failures.push(`Corr: ${metrics.correlation.toFixed(2)}`);
  if (test.rules.maxLimiterGR !== undefined && metrics.maxLimiterGR > test.rules.maxLimiterGR) failures.push(`Limiter GR: ${metrics.maxLimiterGR.toFixed(1)} dB`);

  return { name: test.name, result: failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS", failures, warnings, metrics };
}
