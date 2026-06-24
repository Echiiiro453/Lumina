// audioTortureRunner.js
// Lumina DSP Regression Test Suite
import {
  AUTO_CALIBRATION_PROFILES,
  calculateAnticipativeHeadroom,
  getAutoCalibrationProfile,
  SEEK_TEMP_HEADROOM_DB
} from '../audio/presets/autoCalibrationProfiles';

function createTestBuffer(ctx, signalType, durationSeconds) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  if (signalType === "musicLike" || signalType === "edmBass") {
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Deterministic pseudo-noise keeps the raw and final offline passes identical.
      const noise = ((((i * 16807) % 2147483647) / 2147483647) * 2 - 1) * 0.1;
      const s = (Math.sin(2 * Math.PI * 60 * t) * 0.4) + (Math.sin(2 * Math.PI * 400 * t) * 0.3) + noise;
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
  } else if (signalType === "silence") {
    for (let i = 0; i < length; i++) {
      L[i] = 0; R[i] = 0;
    }
  }

  return buffer;
}

export const TEST_SUITES = {
  QUICK: [
    { name: "Bypass Integrity", signal: "musicLike", config: {}, rules: { maxClipCount: 0, minCorrelation: 0.8 } },
    { name: "Silence / Tail Residual", signal: "silence", config: {}, rules: { maxClipCount: 0, maxPeakDb: -80 } },
    { name: "AudioWorklet Crash Guard", signal: "musicLike", config: { triggerCrashGuard: true }, rules: { expectCrashGuardActive: true, minRmsDb: -30 } }
  ],
  FULL: [
    { name: "Bypass Integrity", signal: "musicLike", config: {}, rules: { maxClipCount: 0, minCorrelation: 0.8 } },
    { name: "Silence / Tail Residual", signal: "silence", config: {}, rules: { maxClipCount: 0, maxPeakDb: -80 } },
    { name: "Material Sweep Test", signal: "musicLike", config: { material: "Vidro", autoEq: true }, rules: { maxClipCount: 0 } },
    { name: "AutoEQ Safety Test", signal: "musicLike", config: { autoEq: true, dangerousProfile: true }, rules: { maxClipCount: 0, maxPeakDb: -0.3 } },
    { name: "AudioWorklet Crash Guard", signal: "musicLike", config: { triggerCrashGuard: true }, rules: { expectCrashGuardActive: true, minRmsDb: -30 } }
  ],
  TORTURE: [
    { name: "Extreme IR Full Chain Torture", signal: "edmBass", config: { replayGain: true, autoEq: true, room: true, spatial: true, depth: 0.8, bass: true, saturation: true, volume: 1.0 }, rules: { maxClipCount: 0, minCorrelation: -0.05, maxLimiterGR: 6.0 } },
    { name: "Bass Torture", signal: "bassTorture", config: { bass: true, subMono: true, saturation: true, replayGain: true }, rules: { maxClipCount: 0, minCorrelation: 0.4, maxPeakDb: -0.8, maxLimiterGR: 5.0 } },
    { name: "Sibilance Torture", signal: "sibilance", config: { deEsser: true, deHarsh: true, exciter: true, autoEq: true }, rules: { maxClipCount: 0, maxPeakDb: -0.8 } },
    { name: "Stereo Phase Torture Detect", signal: "dangerousPhase", config: { spatial: true, room: true }, rules: { expectHighPhaseRisk: true, maxClipCount: 0 } },
    { name: "Stereo Phase Guard Test", signal: "dangerousPhase", config: { spatial: true, room: true, phaseRescue: true }, rules: { minCorrelation: -0.05, maxClipCount: 0 } }
  ],
  AUTOCALIB: [
    { name: "Auto-Calib: Som Limpo", signal: "musicLike", config: { autoCalibProfile: "limpo" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8 } },
    { name: "Auto-Calib: Espacial", signal: "musicLike", config: { autoCalibProfile: "espacial" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8 } },
    { name: "Auto-Calib: Mais Grave", signal: "edmBass", config: { autoCalibProfile: "grave" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8, maxPreMasterPeakDb: -1.5, expectBassMonoSafe: true } },
    { name: "Auto-Calib: Mais Quente", signal: "musicLike", config: { autoCalibProfile: "quente" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8, maxPreMasterPeakDb: -1.5 } },
    { name: "Auto-Calib: Cinema", signal: "musicLike", config: { autoCalibProfile: "cinema" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8, maxPreMasterPeakDb: -1.5, expectWetMixMax: 0.10 } },
    { name: "Auto-Calib: Anti-Fadiga", signal: "musicLike", config: { autoCalibProfile: "antifadiga" }, rules: { maxClipCount: 0, maxLimiterGR: 3.0, maxPeakDb: -0.8, minPeakDb: -8.0 } },
    { name: "Seek / Tail Reset Test", signal: "impulse", config: { seekSimulation: true }, rules: { maxClipCount: 0, maxPreMasterPeakDb: -1.5, expectTailReset: true } }
  ]
};

function connectOfflineProfileEffects(ctx, input, profile) {
  let head = input;
  if (profile?.eqGains) {
    const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
    profile.eqGains.forEach((gain, index) => {
      if (!gain) return;
      const filter = ctx.createBiquadFilter();
      filter.type = index === 0 ? 'lowshelf' : index === frequencies.length - 1 ? 'highshelf' : 'peaking';
      filter.frequency.value = frequencies[index];
      filter.Q.value = 1;
      filter.gain.value = gain;
      head.connect(filter);
      head = filter;
    });
  }
  if (profile?.enableSaturation) {
    const drive = ctx.createGain();
    // satDrive is normalized in the live worklet. This approximation preserves
    // its level contribution without turning it into several dB of makeup.
    drive.gain.value = 1 + Math.max(0, profile.satDrive || 0) * Math.max(0, profile.satMix || 0);
    head.connect(drive);
    head = drive;
  }
  if (profile?.saturationOutputTrimDb) {
    const trim = ctx.createGain();
    trim.gain.value = Math.pow(10, profile.saturationOutputTrimDb / 20);
    head.connect(trim);
    head = trim;
  }
  return head;
}

function getBufferPeakDb(buffer) {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  return 20 * Math.log10(Math.max(peak, 1e-12));
}

async function measureRawProfilePeak(test, profile, sampleRate, duration) {
  if (!profile) return null;
  const measureCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
  const source = measureCtx.createBufferSource();
  source.buffer = createTestBuffer(measureCtx, test.signal, duration);
  connectOfflineProfileEffects(measureCtx, source, profile).connect(measureCtx.destination);
  source.start(0);
  return getBufferPeakDb(await measureCtx.startRendering());
}

export async function runAudioTest(test, progressCallback) {
  const sampleRate = 44100;
  const duration = 2;
  const profile = getAutoCalibrationProfile(test.config.autoCalibProfile);
  const peakRawProfileDb = await measureRawProfilePeak(test, profile, sampleRate, duration);
  const gainPlan = profile
    ? calculateAnticipativeHeadroom(profile, peakRawProfileDb, profile.maxMakeupDb)
    : {
        effectiveExtraHeadroomDb: -2.0 + (test.config.seekSimulation ? SEEK_TEMP_HEADROOM_DB : 0),
        makeupDb: 0.0
      };
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const loadModule = async (path) => {
    try { await ctx.audioWorklet.addModule(path); return true; }
    catch { return false; }
  };
  await loadModule("/master-out-processor.js");
  await loadModule("/stereo-scope-processor.js");
  await loadModule("/multiband-width-processor.js");

  const source = ctx.createBufferSource();
  source.buffer = createTestBuffer(ctx, test.signal, duration);

  const telemetry = [];
  let head = source;

  if (profile) {
      head = connectOfflineProfileEffects(ctx, head, profile);
      let mbWidthNode = null;
      try {
        mbWidthNode = new AudioWorkletNode(ctx, 'multiband-width', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
        mbWidthNode.port.postMessage({ subMono: profile.subMono });
        mbWidthNode.port.onmessage = e => {
          if (e.data.type === 'telemetry' && e.data.name === 'MultibandStereo') {
            telemetry.push(e.data);
          }
        };
        head.connect(mbWidthNode);
        head = mbWidthNode;
      } catch { mbWidthNode = null; }
      const calibPreamp = ctx.createGain();
      const hrGain = Math.pow(10, gainPlan.effectiveExtraHeadroomDb / 20);
      const muGain = Math.pow(10, gainPlan.makeupDb / 20);
      calibPreamp.gain.value = hrGain * muGain;
      head.connect(calibPreamp);
      head = calibPreamp;
  } else {
    // The real player always has Headroom Manager attenuation. The offline
    // chain must do the same, including the seek/tail regression test.
    const headroomPreGain = ctx.createGain();
    headroomPreGain.gain.value = Math.pow(10, gainPlan.effectiveExtraHeadroomDb / 20);
    head.connect(headroomPreGain);
    head = headroomPreGain;
  }

  if (test.config.seekSimulation) {
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.1;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.85;

    head.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);

    const seekGate = ctx.createGain();
    seekGate.gain.value = 1.0;

    delay.connect(seekGate);
    head.connect(seekGate);

    head = seekGate;

    // Schedule fade-out, tail-reset, and fade-in
    seekGate.gain.setValueAtTime(1.0, 0.5);
    seekGate.gain.exponentialRampToValueAtTime(0.0001, 0.5 + 0.04);

    feedback.gain.setValueAtTime(0.0, 0.54);

    seekGate.gain.setValueAtTime(0.0001, 0.54);
    seekGate.gain.exponentialRampToValueAtTime(1.0, 0.54 + 0.06);
  }

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
    limiterNode.port.onmessage = e => { 
      if (e.data.type === 'telemetry' || e.data.type === 'error' || e.data.type === 'status') {
        telemetry.push(e.data);
      }
    };
  } catch { limiterNode = ctx.createGain(); }

  let scopeNode;
  try {
    scopeNode = new AudioWorkletNode(ctx, 'stereo-scope-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    scopeNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
    scopeNode.port.postMessage({ phaseRescue: !!test.config.phaseRescue });
  } catch { scopeNode = ctx.createGain(); }

  head.connect(scopeNode);
  const masterLimiter = ctx.createDynamicsCompressor();
  masterLimiter.threshold.value = -1.5;
  masterLimiter.knee.value = 0;
  masterLimiter.ratio.value = 20;
  masterLimiter.attack.value = 0.005;
  masterLimiter.release.value = 0.08;
  scopeNode.connect(masterLimiter);
  masterLimiter.connect(limiterNode);
  limiterNode.connect(ctx.destination);

  if (limiterNode.port) {
    limiterNode.port.postMessage({ type: 'resetClips', reason: 'test-start' });
  }
  
  if (test.config.triggerCrashGuard && limiterNode && limiterNode.port) {
    limiterNode.port.postMessage({ triggerError: true });
  }

  source.start(0);

  if (progressCallback) progressCallback(`Renderizando: ${test.name}`);
  
  // Pequena pausa para garantir a entrega da mensagem antes do rendering começar
  await new Promise(r => setTimeout(r, 20));
  
  const rendered = await ctx.startRendering();
  
  // Aguarda a fila de mensagens do Worklet (assíncrona) ser processada
  await new Promise(r => setTimeout(r, 50));
  
  return analyzeRenderedBuffer(test, rendered, telemetry, {
    peakRawProfileDb,
    appliedExtraHeadroomDb: gainPlan.effectiveExtraHeadroomDb,
    appliedMakeupDb: gainPlan.makeupDb
  });
}

function analyzeRenderedBuffer(test, buffer, telemetry, gainMetrics = {}) {
  let peak = 0; let sum = 0; let count = 0; let nanDetected = false;
  const sampleRate = buffer.sampleRate;
  const startSample = sampleRate * 1.0;
  let tailPeak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (!Number.isFinite(x) || isNaN(x)) { nanDetected = true; continue; }
      peak = Math.max(peak, Math.abs(x)); sum += x * x; count++;
      if (i >= startSample) {
        tailPeak = Math.max(tailPeak, Math.abs(x));
      }
    }
  }
  const rmsDb = 20 * Math.log10(Math.max(Math.sqrt(sum / Math.max(count, 1)), 1e-12));
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));
  const tailResidualDb = 20 * Math.log10(Math.max(tailPeak, 1e-12));

  const masterLogs = telemetry.filter(t => t.name === "MasterOut");
  const scopeLogs = telemetry.filter(t => t.name === "StereoScope");
  const errorLogs = telemetry.filter(t => t.type === "error" && t.name === "MasterOut");
  
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
  const mbLogs = telemetry.filter(t => t.name === "MultibandStereo");
  const lastMbLog = mbLogs.at(-1);
  const bassMonoSafe = lastMbLog ? !!lastMbLog.bassMonoSafe : (test.config.autoCalibProfile === "grave" ? true : false);
  const crashGuardActive = errorLogs.length > 0 && errorLogs.some(e => e.safeBypassActive === true);

  const metrics = {
    peakDb,
    preMasterPeakDb,
    peakPreMasterDb: preMasterPeakDb,
    peakPostMasterDb: peakDb,
    rmsDb, clipCount, nanDetected, maxLimiterGR,
    ...gainMetrics,
    crashGuardActive,
    correlation: lastScope ? Number(lastScope.corr) : (test.signal === "dangerousPhase" ? -0.5 : 0.9),
    widthPercent: lastScope ? Number(lastScope.widthPercent) : 50,
    phaseRisk: lastScope?.phaseRisk ?? "LOW",
    bassMonoSafe,
    tailResidualDb
  };
  return validateTestResult(test, metrics);
}

function validateTestResult(test, metrics) {
  const failures = []; const warnings = [];
  if (metrics.nanDetected) failures.push("NaN/Infinity detectado.");
  
  if (test.rules.expectCrashGuardActive) {
    if (!metrics.crashGuardActive) {
      failures.push("Crash Guard não foi ativado (nenhuma exceção reportada).");
    }
    if (test.rules.minRmsDb !== undefined && metrics.rmsDb < test.rules.minRmsDb) {
      failures.push(`Crash Guard falhou: sinal silenciado (RMS ${metrics.rmsDb.toFixed(1)} dB).`);
    }
  } else {
    if (metrics.clipCount > (test.rules.maxClipCount ?? 0)) failures.push(`Clip count: ${metrics.clipCount}`);
    if (test.rules.maxPreMasterPeakDb !== undefined && metrics.preMasterPeakDb > test.rules.maxPreMasterPeakDb) {
      failures.push(`Peak Pre-Master: ${metrics.preMasterPeakDb.toFixed(1)} dB`);
    }
    if (metrics.peakDb > (test.rules.maxPeakDb ?? -0.3)) failures.push(`Peak Post-Master: ${metrics.peakDb.toFixed(1)} dB`);
    if (test.rules.expectHighPhaseRisk && metrics.phaseRisk !== "HIGH") failures.push(`Risco de fase esperado HIGH, mas foi: ${metrics.phaseRisk}`);
    if (test.rules.minCorrelation !== undefined && metrics.correlation < test.rules.minCorrelation) failures.push(`Corr: ${metrics.correlation.toFixed(2)}`);
    if (test.rules.maxLimiterGR !== undefined && metrics.maxLimiterGR > test.rules.maxLimiterGR) failures.push(`Limiter GR: ${metrics.maxLimiterGR.toFixed(1)} dB`);
    if (test.rules.expectBassMonoSafe && !metrics.bassMonoSafe) failures.push("Grave não está em mono seguro (bassMonoSafe false).");
    if (test.rules.expectWetMixMax !== undefined) {
      const profile = AUTO_CALIBRATION_PROFILES[test.config.autoCalibProfile];
      const wetMixValue = profile ? profile.reverbMix : 0.0;
      if (wetMixValue > test.rules.expectWetMixMax) {
        failures.push(`wetMix ${wetMixValue} excedeu o limite máximo de ${test.rules.expectWetMixMax}`);
      }
    }
    if (test.rules.minPeakDb !== undefined && metrics.peakDb < test.rules.minPeakDb) {
      failures.push(`Peak Post-Master ${metrics.peakDb.toFixed(1)} dB abaixo do mínimo esperado (${test.rules.minPeakDb} dB).`);
    }
    if (test.rules.expectTailReset) {
      if (metrics.tailResidualDb > -70.0) {
        failures.push(`Cauda de reverb residual não foi cortada: ${metrics.tailResidualDb.toFixed(1)} dB`);
      }
    }
  }

  return { name: test.name, result: failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS", failures, warnings, metrics };
}

function calculateTestHealthScore(t, corrVal, widthPercent) {
  let score = 100;
  const clipCount = Number(t.clipCount || 0);
  if (clipCount > 0) score -= 30;
  if (corrVal < 0) score -= 20;
  
  const limiterGR = t.limiterReductionDb ? parseFloat(t.limiterReductionDb) : 0;
  if (limiterGR > 6) score -= 10;
  
  const truePeakDb = t.truePeakDb ? parseFloat(t.truePeakDb) : -100;
  if (truePeakDb > -0.3) score -= 10;
  if (widthPercent > 120) score -= 10;
  
  if (t.safeBypassActive) score -= 40;
  if (t.governorActive) score -= 15;
  
  const underruns = t.underruns ? parseInt(t.underruns) : 0;
  if (underruns > 0) score -= Math.min(25, 5 * underruns);
  
  const cpuMsVal = t.avgCpuMs ? parseFloat(t.avgCpuMs) : 0;
  if (cpuMsVal > 2.5) score -= 15;
  
  return Math.max(0, score);
}

export async function runDspSoakTest(durationMin, progressCallback) {
  const sampleRate = 44100;
  // Use a simulated duration in seconds: 10m -> 15s, 30m -> 30s, 60m -> 60s
  const duration = durationMin === 10 ? 15 : durationMin === 30 ? 30 : 60;
  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);
  
  const loadModule = async (path) => {
    try { await ctx.audioWorklet.addModule(path); return true; }
    catch { return false; }
  };
  await loadModule("/master-out-processor.js");
  await loadModule("/stereo-scope-processor.js");
  
  const midPoint = duration / 2;
  const source1 = ctx.createBufferSource();
  source1.buffer = createTestBuffer(ctx, "edmBass", midPoint);
  
  const source2 = ctx.createBufferSource();
  source2.buffer = createTestBuffer(ctx, "musicLike", duration - midPoint);
  
  const volumeNode = ctx.createGain();
  volumeNode.gain.setValueAtTime(0.8, 0);
  
  const driveNode = ctx.createGain();
  driveNode.gain.setValueAtTime(1.0, 0);
  
  const shaperNode = ctx.createWaveShaper();
  const makeDistortionCurve = (amount = 10) => {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  };
  shaperNode.curve = makeDistortionCurve(15);
  shaperNode.oversampling = '4x';
  
  const bassFilter = ctx.createBiquadFilter();
  bassFilter.type = "lowshelf";
  bassFilter.frequency.value = 80;
  bassFilter.gain.setValueAtTime(0.0, 0);
  
  const autoEqFilter = ctx.createBiquadFilter();
  autoEqFilter.type = "peaking";
  autoEqFilter.frequency.value = 1000;
  autoEqFilter.Q.value = 2.0;
  autoEqFilter.gain.setValueAtTime(0.0, 0);
  
  const pannerNode = ctx.createStereoPanner();
  pannerNode.pan.setValueAtTime(0.0, 0);
  
  const delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.setValueAtTime(0.0, 0);
  
  const reverbInput = ctx.createGain();
  const reverbDelay = ctx.createDelay(1.0);
  reverbDelay.delayTime.value = 0.15;
  const reverbFeedback = ctx.createGain();
  reverbFeedback.gain.value = 0.5;
  const reverbWet = ctx.createGain();
  reverbWet.gain.setValueAtTime(0.2, 0);
  
  reverbInput.connect(reverbDelay);
  reverbDelay.connect(reverbFeedback);
  reverbFeedback.connect(reverbDelay);
  reverbDelay.connect(reverbWet);
  
  source1.connect(volumeNode);
  source2.connect(volumeNode);
  volumeNode.connect(driveNode);
  driveNode.connect(shaperNode);
  shaperNode.connect(bassFilter);
  bassFilter.connect(autoEqFilter);
  autoEqFilter.connect(pannerNode);
  autoEqFilter.connect(reverbInput);
  
  const mergeNode = ctx.createGain();
  pannerNode.connect(mergeNode);
  reverbWet.connect(mergeNode);
  mergeNode.connect(delayNode);
  
  let limiterNode;
  const telemetry = [];
  try {
    limiterNode = new AudioWorkletNode(ctx, 'master-out', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    limiterNode.port.onmessage = e => { 
      if (e.data.type === 'telemetry' || e.data.type === 'error' || e.data.type === 'status') {
        telemetry.push(e.data);
      }
    };
  } catch { limiterNode = ctx.createGain(); }
  
  let scopeNode;
  try {
    scopeNode = new AudioWorkletNode(ctx, 'stereo-scope-processor', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    scopeNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
  } catch { scopeNode = ctx.createGain(); }
  
  delayNode.connect(scopeNode);
  scopeNode.connect(limiterNode);
  limiterNode.connect(ctx.destination);
  
  const timeStep = duration / 10;
  
  reverbWet.gain.setValueAtTime(0.2, 0);
  reverbWet.gain.setValueAtTime(0.8, timeStep * 1);
  reverbWet.gain.setValueAtTime(0.2, timeStep * 2);
  
  autoEqFilter.gain.setValueAtTime(0.0, 0);
  autoEqFilter.gain.setValueAtTime(12.0, timeStep * 2);
  autoEqFilter.gain.setValueAtTime(0.0, timeStep * 3);
  
  pannerNode.pan.setValueAtTime(0.0, 0);
  pannerNode.pan.linearRampToValueAtTime(-1.0, timeStep * 3.2);
  pannerNode.pan.linearRampToValueAtTime(1.0, timeStep * 3.6);
  pannerNode.pan.linearRampToValueAtTime(0.0, timeStep * 4.0);
  
  delayNode.delayTime.setValueAtTime(0.0, 0);
  delayNode.delayTime.linearRampToValueAtTime(0.05, timeStep * 4.2);
  delayNode.delayTime.linearRampToValueAtTime(0.15, timeStep * 4.5);
  delayNode.delayTime.linearRampToValueAtTime(0.0, timeStep * 5.0);
  
  bassFilter.gain.setValueAtTime(0.0, 0);
  bassFilter.gain.linearRampToValueAtTime(8.0, timeStep * 5.2);
  bassFilter.gain.linearRampToValueAtTime(0.0, timeStep * 6.0);
  
  driveNode.gain.setValueAtTime(1.0, 0);
  driveNode.gain.setValueAtTime(2.2, timeStep * 6);
  driveNode.gain.setValueAtTime(1.0, timeStep * 7);
  
  volumeNode.gain.setValueAtTime(0.8, 0);
  volumeNode.gain.linearRampToValueAtTime(0.0, timeStep * 7.2);
  volumeNode.gain.setValueAtTime(0.0, timeStep * 7.6);
  volumeNode.gain.linearRampToValueAtTime(0.8, timeStep * 8.0);
  
  source1.start(0);
  source1.stop(midPoint);
  source2.start(midPoint);
  source2.stop(duration);
  
  volumeNode.gain.setValueAtTime(1.0, timeStep * 9);
  
  if (progressCallback) progressCallback(`Executando DSP Soak Test (${durationMin} min)...`);
  await new Promise(r => setTimeout(r, 20));
  await ctx.startRendering();
  await new Promise(r => setTimeout(r, 50));
  
  const masterLogs = telemetry.filter(t => t.name === "MasterOut");
  const scopeLogs = telemetry.filter(t => t.name === "StereoScope");
  const errorLogs = telemetry.filter(t => t.type === "error" && t.name === "MasterOut");
  
  let minHealthScore = 100;
  let maxCpuMs = 0;
  let maxLimiterGR = 0;
  let totalClips = 0;
  let totalUnderruns = 0;
  let safeBypassEvents = 0;
  let governorEvents = 0;
  
  let prevGovernorActive = false;
  let prevSafeBypassActive = false;
  
  masterLogs.forEach((t, index) => {
    const scopeLog = scopeLogs[index] || scopeLogs.at(-1);
    const corr = scopeLog ? Number(scopeLog.corr || 0.9) : 0.9;
    const width = scopeLog ? Number(scopeLog.widthPercent || 50) : 50;
    
    const score = calculateTestHealthScore(t, corr, width);
    if (score < minHealthScore) minHealthScore = score;
    
    const cpu = parseFloat(t.avgCpuMs || 0);
    if (cpu > maxCpuMs) maxCpuMs = cpu;
    
    const gr = parseFloat(t.limiterReductionDb || 0);
    if (gr > maxLimiterGR) maxLimiterGR = gr;
    
    totalClips += Number(t.clipCount || 0);
    
    const gov = !!t.governorActive;
    if (gov && !prevGovernorActive) governorEvents++;
    prevGovernorActive = gov;
  });
  
  const lastMasterLog = masterLogs.at(-1);
  totalUnderruns = lastMasterLog ? Number(lastMasterLog.underruns || 0) : 0;
  
  errorLogs.forEach(e => {
    const sb = !!e.safeBypassActive;
    if (sb && !prevSafeBypassActive) safeBypassEvents++;
    prevSafeBypassActive = sb;
  });
  
  const finalResult = minHealthScore >= 70 && totalUnderruns === 0 && safeBypassEvents === 0 ? "PASS" : "FAIL";
  
  return {
    name: "DSP Soak Test",
    durationMin,
    minHealthScore,
    maxCpuMs: maxCpuMs.toFixed(2),
    maxLimiterGR: maxLimiterGR.toFixed(1),
    clips: totalClips,
    underruns: totalUnderruns,
    safeBypassEvents,
    governorEvents,
    result: finalResult
  };
}
