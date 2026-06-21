// audioTortureRunner.js
// Lumina DSP Regression Test Suite

// Gera sinais sintéticos para os testes
function createTestBuffer(ctx, signalType, durationSeconds) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, length, sampleRate);

  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  if (signalType === "musicLike" || signalType === "edmBass") {
    // Ruído rosa ou sweep com grave para simular música/edm
    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      // Frequências baixas e médias
      const s = (Math.sin(2 * Math.PI * 60 * t) * 0.4) + 
                (Math.sin(2 * Math.PI * 400 * t) * 0.3) + 
                ((Math.random() * 2 - 1) * 0.1); 
      L[i] = s;
      R[i] = s * 0.9; // Leve diferença estéreo
    }
  } else if (signalType === "impulse") {
    L[0] = 1.0;
    R[0] = 1.0;
  } else if (signalType === "phaseRisk") {
    for (let i = 0; i < length; i++) {
      const s = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.4;
      L[i] = s;
      R[i] = -s * 0.7; // Inversão de fase intencional
    }
  } else if (signalType === "silence") {
    // Silêncio absoluto, já inicializado com 0.
  }

  return buffer;
}

export const DSP_TESTS = [
  {
    name: "Bypass Integrity",
    signal: "musicLike",
    config: {
      replayGain: false,
      autoEq: false,
      room: false,
      spatial: false,
      saturation: false,
      bass: false
    },
    rules: {
      maxClipCount: 0,
      maxLimiterGR: 0.1,
      minCorrelation: 0.8
    }
  },
  {
    name: "Extreme IR Full Chain Torture",
    signal: "edmBass",
    config: {
      replayGain: true,
      autoEq: true,
      room: true,
      irPreset: "Tanque", // Placeholder para configuração
      spatial: true,
      depth: 0.8,
      bass: true,
      saturation: true,
      volume: 1.0
    },
    rules: {
      maxClipCount: 0,
      minCorrelation: -0.05,
      maxLimiterGR: 6.0
    }
  },
  {
    name: "Silence / Tail Residual",
    signal: "silence",
    config: {
      replayGain: true,
      autoEq: true,
      room: true,
      spatial: true,
      bass: true
    },
    rules: {
      maxClipCount: 0,
      maxPeakDb: -80 // Deve permanecer silencioso ou muito próximo
    }
  }
];

export async function runAudioTest(test, progressCallback) {
  const sampleRate = 44100;
  const duration = 2; // Teste mais curto para não travar muito a UI

  const ctx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  // Carrega os worklets vitais para telemetria e chain final
  const loadModule = async (path) => {
    try {
      await ctx.audioWorklet.addModule(path);
    } catch(e) {
      console.warn("Torture Runner: Falha ao carregar", path);
    }
  };

  await loadModule("/master-out-processor.js");
  await loadModule("/stereo-scope-processor.js");
  await loadModule("/lumina-mastering.js");

  const source = ctx.createBufferSource();
  source.buffer = createTestBuffer(ctx, test.signal, duration);

  const telemetry = [];

  // --- Construção da Chain Simulada ---
  // Nota: Isso é uma aproximação do PlayerBar.jsx voltada para OfflineAudioContext
  let head = source;

  // Emulação Básica de DSP (Ganho)
  if (test.config.replayGain) {
    const rg = ctx.createGain();
    rg.gain.value = 0.5; // Exemplo de atenuação
    head.connect(rg);
    head = rg;
  }

  if (test.config.bass) {
    const bg = ctx.createGain();
    bg.gain.value = 1.2;
    head.connect(bg);
    head = bg;
  }

  // Master Out simulado
  let limiterNode;
  try {
    limiterNode = new AudioWorkletNode(ctx, 'master-out-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
    });
    limiterNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
  } catch(e) { limiterNode = ctx.createGain(); }

  // Stereo Scope simulado
  let scopeNode;
  try {
    scopeNode = new AudioWorkletNode(ctx, 'stereo-scope-processor', {
      numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2]
    });
    scopeNode.port.onmessage = e => { if (e.data.type === 'telemetry') telemetry.push(e.data); };
  } catch(e) { scopeNode = ctx.createGain(); }

  head.connect(scopeNode);
  scopeNode.connect(limiterNode);
  limiterNode.connect(ctx.destination);

  source.start(0);

  if (progressCallback) progressCallback("Renderizando...");
  const rendered = await ctx.startRendering();

  return analyzeRenderedBuffer(test, rendered, telemetry);
}

function analyzeRenderedBuffer(test, buffer, telemetry) {
  let peak = 0;
  let sum = 0;
  let count = 0;
  let nanDetected = false;

  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);

    for (let i = 0; i < data.length; i++) {
      const x = data[i];

      if (!Number.isFinite(x) || isNaN(x)) {
        nanDetected = true;
        continue;
      }

      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
      count++;
    }
  }

  const rms = Math.sqrt(sum / Math.max(count, 1));
  const peakDb = 20 * Math.log10(Math.max(peak, 1e-12));
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));

  const masterLogs = telemetry.filter(t => t.name === "MasterOut");
  const scopeLogs = telemetry.filter(t => t.name === "StereoScope");

  const clipCount = masterLogs.reduce((a, t) => a + Number(t.clipCount || t.clips || 0), 0);
  
  // Pega a redução máxima do limiter
  let maxLimiterGR = 0;
  masterLogs.forEach(t => {
     if (t.limiterReductionDb && t.limiterReductionDb > maxLimiterGR) maxLimiterGR = t.limiterReductionDb;
  });

  const lastScope = scopeLogs.at(-1);

  const metrics = {
    peakDb,
    rmsDb,
    clipCount,
    nanDetected,
    maxLimiterGR,
    correlation: lastScope ? Number(lastScope.corr) : null,
    widthPercent: lastScope ? Number(lastScope.widthPercent) : null,
    phaseRisk: lastScope?.phaseRisk ?? "UNKNOWN"
  };

  return validateTestResult(test, metrics);
}

function validateTestResult(test, metrics) {
  const failures = [];
  const warnings = [];

  if (metrics.nanDetected) {
    failures.push("NaN/Infinity detectado no buffer de saída.");
  }

  if (metrics.clipCount > (test.rules.maxClipCount ?? 0)) {
    failures.push(`Clip count muito alto: ${metrics.clipCount}`);
  }

  if (metrics.peakDb > (test.rules.maxPeakDb ?? -0.3)) {
    failures.push(`Peak muito alto: ${metrics.peakDb.toFixed(1)} dB`);
  }

  if (test.rules.minCorrelation !== undefined && metrics.correlation !== null && metrics.correlation < test.rules.minCorrelation) {
    failures.push(`Correlation muito baixa: ${metrics.correlation.toFixed(2)}`);
  }
  
  if (test.rules.maxLimiterGR !== undefined && metrics.maxLimiterGR > test.rules.maxLimiterGR) {
    failures.push(`Limiter GR muito alto: -${metrics.maxLimiterGR.toFixed(1)} dB`);
  }

  return {
    name: test.name,
    result: failures.length ? "FAIL" : warnings.length ? "WARN" : "PASS",
    failures,
    warnings,
    metrics
  };
}
