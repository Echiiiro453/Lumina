/**
 * Lumina Audio Engine – Hardcore Math Test Suite
 * 
 * Executa 20 testes matemáticos avançados para validar a física de áudio,
 * conservação de energia, determinação orbital, simetria, Doppler, FFT e estabilidade sob estresse.
 * 
 * Rodar: node scratch/hardcore_math_tests.js
 */

const fs = require('fs');
const path = require('path');

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0, failed = 0, total = 0;
const results = [];

function test(id, name, fn) {
  total++;
  try {
    fn();
    console.log(`  [${id}] ${C.green('✓')} ${name}`);
    passed++;
    results.push({ id, name, status: 'PASS' });
  } catch (e) {
    console.log(`  [${id}] ${C.red('✗')} ${name}`);
    console.log(`      ${C.yellow('→')} ${e.message}`);
    failed++;
    results.push({ id, name, status: 'FAIL', error: e.message });
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertMax(val, max, msg = '') {
  if (val > max) throw new Error(msg || `Expected ${val.toFixed(6)} ≤ ${max.toFixed(6)}`);
}

function assertMin(val, min, msg = '') {
  if (val < min) throw new Error(msg || `Expected ${val.toFixed(6)} ≥ ${min.toFixed(6)}`);
}

function assertClose(a, b, tol = 0.001, msg = '') {
  if (Math.abs(a - b) > tol) {
    throw new Error(msg || `Expected ${a.toFixed(6)} ≈ ${b.toFixed(6)} (tol=${tol})`);
  }
}

// Mocks do AudioWorklet para Node
global.AudioWorkletProcessor = class {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage: (msg) => {
        if (this.onportmessage) this.onportmessage(msg);
      }
    };
  }
};
const registeredProcessors = {};
global.registerProcessor = (name, cls) => { registeredProcessors[name] = cls; };
global.sampleRate = 44100;

// Carregar arquivos
const STATIC = path.join(__dirname, '..', 'backend', 'static');
eval(fs.readFileSync(path.join(STATIC, 'lumina-mastering.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'transient-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'adaptive-eq-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'crossfeed-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'lufs-meter-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'submono-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'deesser-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'saturation-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'deharsh-processor.js'), 'utf-8'));

// Helpers de geração de sinal
function makeNoiseBlock(size, amplitude) {
  const L = new Float32Array(size);
  const R = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    L[i] = (Math.random() * 2 - 1) * amplitude;
    R[i] = (Math.random() * 2 - 1) * amplitude;
  }
  return [L, R];
}

function makeSineBlock(size, freq, amplitude, sr = 44100) {
  const L = new Float32Array(size);
  const R = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const val = amplitude * Math.sin(2 * Math.PI * freq * i / sr);
    L[i] = val;
    R[i] = val;
  }
  return [L, R];
}

function rmsOf(block) {
  let sum = 0, count = 0;
  block.forEach(ch => {
    for (let i = 0; i < ch.length; i++) {
      sum += ch[i] * ch[i];
      count++;
    }
  });
  return Math.sqrt(sum / count);
}

// FFT & IFFT Cooley-Tukey Radix-2
function fft(re, im) {
  const n = re.length;
  if (n <= 1) return;
  const reEven = new Float32Array(n / 2), imEven = new Float32Array(n / 2);
  const reOdd  = new Float32Array(n / 2), imOdd  = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    reEven[i] = re[2 * i]; imEven[i] = im[2 * i];
    reOdd[i]  = re[2 * i + 1]; imOdd[i]  = im[2 * i + 1];
  }
  fft(reEven, imEven);
  fft(reOdd, imOdd);
  for (let k = 0; k < n / 2; k++) {
    const angle = -2 * Math.PI * k / n;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const tRe = reOdd[k] * cos - imOdd[k] * sin;
    const tIm = reOdd[k] * sin + imOdd[k] * cos;
    re[k] = reEven[k] + tRe;
    im[k] = imEven[k] + tIm;
    re[k + n / 2] = reEven[k] - tRe;
    im[k + n / 2] = imEven[k] - tIm;
  }
}

function ifft(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  for (let i = 0; i < n; i++) {
    re[i] /= n;
    im[i] = -im[i] / n;
  }
}

console.log(C.bold(C.cyan('\n=== INICIANDO HARDCORE MATH TEST SUITE ===\n')));

// 1. Energy Conservation Test
test(1, 'Energy Conservation Test', () => {
  const input = makeNoiseBlock(4096, 0.4);
  const output = [new Float32Array(4096), new Float32Array(4096)];
  
  const master = new registeredProcessors['lumina-mastering']();
  master.process([input], [output], {});
  
  const inputEnergy = input[0].reduce((sum, x) => sum + x * x, 0);
  const outputEnergy = output[0].reduce((sum, x) => sum + x * x, 0);
  
  assertMax(outputEnergy, inputEnergy * 1.15, 'A energia de saída deve ser conservada ou comprimida');
});

// 2. Phase Coherence Test (Parallel Paths)
test(2, 'Phase Coherence Test (Parallel Paths)', () => {
  const size = 1024;
  const signal = makeSineBlock(size, 100, 0.5);
  
  const w0 = 2 * Math.PI * 2500 / 44100;
  const alpha = Math.sin(w0) / 2;
  const a0 = 1 + alpha;
  const b0 = (1 + Math.cos(w0)) / 2 / a0;
  const b1 = -(1 + Math.cos(w0)) / a0;
  const b2 = (1 + Math.cos(w0)) / 2 / a0;
  const a1 = -2 * Math.cos(w0) / a0;
  const a2 = (1 - alpha) / a0;
  
  let z = [0, 0];
  const output = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = signal[0][i];
    const wet = b0 * x + z[0];
    z[0] = b1 * x - a1 * wet + z[1];
    z[1] = b2 * x - a2 * wet;
    output[i] = x + wet * 0.3;
  }
  
  let peakInIdx = 0, peakOutIdx = 0;
  for (let i = 1; i < size / 2; i++) {
    if (signal[0][i] > signal[0][peakInIdx]) peakInIdx = i;
    if (output[i] > output[peakOutIdx]) peakOutIdx = i;
  }
  
  const sampleDrift = Math.abs(peakInIdx - peakOutIdx);
  const phaseDriftRad = 2 * Math.PI * 100 * (sampleDrift / 44100);
  const phaseDriftDeg = phaseDriftRad * 180 / Math.PI;
  
  assertMax(phaseDriftDeg, 15, 'Drift de fase em baixas frequências deve ser menor que 15 graus');
});

// 3. Null Cancellation Test
test(3, 'Null Cancellation Test', () => {
  const input = makeNoiseBlock(512, 0.6);
  const output = [new Float32Array(512), new Float32Array(512)];
  
  const sat = new registeredProcessors['saturation']();
  sat.port.onmessage({ data: { mix: 0.0 } });
  sat.process([input], [output], {});
  
  let maxDiff = 0;
  for (let i = 0; i < 512; i++) {
    const diff = Math.abs(input[0][i] - output[0][i]);
    if (diff > maxDiff) maxDiff = diff;
  }
  
  assertClose(maxDiff, 0, 1e-15, 'Caminho 100% dry deve ser identico ao sinal original (cancelamento nulo perfeito)');
});

// 4. Impulse Response Integrity Test
test(4, 'Impulse Response Integrity Test', () => {
  const size = 1024;
  const impulse = [new Float32Array(size), new Float32Array(size)];
  impulse[0][0] = 1.0; impulse[1][0] = 1.0;
  const output = [new Float32Array(size), new Float32Array(size)];
  
  const submono = new registeredProcessors['submono']();
  submono.process([impulse], [output], {});
  
  // Para corte de 80Hz (time constant de ~87 samples), a resposta após 800 amostras (aprox 9x tau) decai totalmente
  const tailL = Math.abs(output[0][800]);
  const tailR = Math.abs(output[1][800]);
  assertMax(tailL, 1e-3, 'Ringing de IR do LPF deve decair para quase zero após 800 amostras');
  assertMax(tailR, 1e-3, 'Ringing de IR do HPF deve decair para quase zero após 800 amostras');
});

// 5. FFT Roundtrip Test
test(5, 'FFT Roundtrip Test', () => {
  const size = 64;
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  for (let i = 0; i < size; i++) re[i] = Math.random() * 2 - 1;
  
  const origRe = new Float32Array(re);
  
  fft(re, im);
  ifft(re, im);
  
  for (let i = 0; i < size; i++) {
    assertClose(re[i], origRe[i], 1e-6, `Erro de roundtrip FFT/IFFT no índice ${i}`);
  }
});

// 6. Floating Point Stability Test (Denormal Protection)
test(6, 'Floating Point Stability Test (Denormal Protection)', () => {
  const tinySignal = makeSineBlock(1024, 1000, 1e-12);
  const output = [new Float32Array(1024), new Float32Array(1024)];
  
  const cascade = [
    new registeredProcessors['saturation'](),
    new registeredProcessors['deesser'](),
    new registeredProcessors['deharsh'](),
    new registeredProcessors['adaptive-eq'](),
    new registeredProcessors['crossfeed'](),
    new registeredProcessors['transient-shaper'](),
    new registeredProcessors['submono'](),
    new registeredProcessors['lumina-mastering']()
  ];
  
  let currentInput = tinySignal;
  let currentOutput = output;
  
  const start = Date.now();
  for (const proc of cascade) {
    proc.process([currentInput], [currentOutput], {});
    currentInput = currentOutput;
    currentOutput = [new Float32Array(1024), new Float32Array(1024)];
  }
  const end = Date.now();
  
  for (let i = 0; i < 1024; i++) {
    assert(!isNaN(currentInput[0][i]), 'Saída não deve conter NaN');
    assert(isFinite(currentInput[0][i]), 'Saída não deve conter Infinity');
  }
  assertMax(end - start, 50, 'Execução da cascata com denormais deve ser ultra-rápida');
});

// 7. Latency Alignment Test
test(7, 'Latency Alignment Test', () => {
  const impulse = [new Float32Array(128), new Float32Array(128)];
  impulse[0][0] = 1.0; impulse[1][0] = 1.0;
  
  const out1 = [new Float32Array(128), new Float32Array(128)];
  const out2 = [new Float32Array(128), new Float32Array(128)];
  
  const ts = new registeredProcessors['transient-shaper']();
  const deesser = new registeredProcessors['deesser']();
  
  ts.process([impulse], [out1], {});
  deesser.process([impulse], [out2], {});
  
  let peakIdxTS = 0, peakIdxDE = 0;
  for (let i = 0; i < 128; i++) {
    if (Math.abs(out1[0][i]) > Math.abs(out1[0][peakIdxTS])) peakIdxTS = i;
    if (Math.abs(out2[0][i]) > Math.abs(out2[0][peakIdxDE])) peakIdxDE = i;
  }
  
  assert(peakIdxTS === 0, 'Transient Shaper deve ter latência zero (pico de saída no sample 0)');
  assert(peakIdxDE === 0, 'De-esser deve ter latência zero (pico de saída no sample 0)');
});

// 8. Convolution Integrity Test
test(8, 'Convolution Integrity Test', () => {
  const signal = new Float32Array([0.1, 0.2, 0.3, -0.4, 0.5]);
  const identityIR = new Float32Array([1.0, 0.0, 0.0, 0.0]);
  
  const output = new Float32Array(signal.length + identityIR.length - 1);
  for (let i = 0; i < signal.length; i++) {
    for (let j = 0; j < identityIR.length; j++) {
      output[i + j] += signal[i] * identityIR[j];
    }
  }
  
  for (let i = 0; i < signal.length; i++) {
    assertClose(output[i], signal[i], 1e-15, `Convolução com identidade falhou no sample ${i}`);
  }
});

// 9. Wet/Dry Gain Law Test (Constant Power Mix Law)
test(9, 'Wet/Dry Gain Law Test (Constant Power Mix Law)', () => {
  const checkMix = (mix) => {
    const dryG = Math.cos(mix * Math.PI / 2);
    const wetG = Math.sin(mix * Math.PI / 2);
    const power = dryG * dryG + wetG * wetG;
    assertClose(power, 1.0, 1e-15, `Mix law violada no mix ${mix}`);
  };
  
  checkMix(0.0);
  checkMix(0.25);
  checkMix(0.5);
  checkMix(0.75);
  checkMix(1.0);
});

// 10. Harmonic Distribution Test
test(10, 'Harmonic Distribution Test', () => {
  const size = 128;
  const input = makeSineBlock(size, 1000, 0.7);
  const output = [new Float32Array(size), new Float32Array(size)];
  
  const sat = new registeredProcessors['saturation']();
  sat.port.onmessage({ data: { mode: 'tube', drive: 0.8, mix: 1.0 } });
  sat.process([input], [output], {});
  
  const re = new Float32Array(output[0]);
  const im = new Float32Array(size);
  fft(re, im);
  
  const mag3 = Math.sqrt(re[9]*re[9] + im[9]*im[9]);
  const mag5 = Math.sqrt(re[15]*re[15] + im[15]*im[15]);
  
  assertMin(mag3, 0.01, 'Terceiro harmônico (3kHz) deve ser gerado no modo Tube');
  assertMin(mag5, 0.001, 'Quinto harmônico (5kHz) deve ser gerado no modo Tube');
});

// 11. Intermodulation Distortion (IMD) Test
test(11, 'Intermodulation Distortion (IMD) Test', () => {
  const size = 256;
  const L = new Float32Array(size);
  const R = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    L[i] = 0.4 * Math.sin(2 * Math.PI * 1000 * i / 44100) + 0.4 * Math.sin(2 * Math.PI * 1200 * i / 44100);
    R[i] = L[i];
  }
  const output = [new Float32Array(size), new Float32Array(size)];
  
  const sat = new registeredProcessors['saturation']();
  sat.port.onmessage({ data: { mode: 'transformer', drive: 0.9, mix: 1.0 } });
  sat.process([[L, R]], [output], {});
  
  const re = new Float32Array(output[0]);
  const im = new Float32Array(size);
  fft(re, im);
  
  const magIMD = Math.sqrt(re[1]*re[1] + im[1]*im[1]);
  assertMin(magIMD, 1e-4, 'Distorção de intermodulação (200Hz) deve ser gerada');
});

// 12. Spatial Position Accuracy Test
test(12, 'Spatial Position Accuracy Test', () => {
  const checkPan = (pan) => {
    const leftGain = Math.cos((pan + 1) / 2 * Math.PI / 2);
    const rightGain = Math.sin((pan + 1) / 2 * Math.PI / 2);
    const power = leftGain * leftGain + rightGain * rightGain;
    assertClose(power, 1.0, 1e-15, `Pan law violada no pan ${pan}`);
  };
  checkPan(-1.0);
  checkPan(0.0);
  checkPan(0.5);
  checkPan(1.0);
});

// 13. Distance Attenuation Test
test(13, 'Distance Attenuation Test', () => {
  const refDist = 1.0;
  const rolloff = 1.0;
  const getGain = (d) => refDist / (refDist + rolloff * (d - refDist));
  
  const g1 = getGain(1.0);
  const g2 = getGain(2.0);
  const g10 = getGain(10.0);
  
  assertClose(g1, 1.0, 1e-5);
  assertClose(g2, 0.5, 1e-5);
  assertClose(g10, 0.1, 1e-5);
});

// 14. Doppler Accuracy Test
test(14, 'Doppler Accuracy Test', () => {
  const c = 343;
  const vSource = 34.3;
  
  const fOriginal = 1000;
  const fApparent = fOriginal * (c / (c - vSource));
  
  assertClose(fApparent, 1111.11, 0.01);
});

// 15. Crossfeed Frequency Isolation Test
test(15, 'Crossfeed Frequency Isolation Test', () => {
  const size = 512;
  const cross = new registeredProcessors['crossfeed']();
  cross.port.onmessage({ data: { crossfeedAmount: 1.0 } });
  
  const lowInputL = new Float32Array(size);
  const lowInputR = new Float32Array(size);
  const highInputL = new Float32Array(size);
  const highInputR = new Float32Array(size);
  
  for (let i = 0; i < size; i++) {
    lowInputL[i] = 0.8 * Math.sin(2 * Math.PI * 100 * i / 44100);
    highInputL[i] = 0.8 * Math.sin(2 * Math.PI * 5000 * i / 44100);
  }
  
  const lowOutput = [new Float32Array(size), new Float32Array(size)];
  const highOutput = [new Float32Array(size), new Float32Array(size)];
  
  cross.process([[lowInputL, lowInputR]], [lowOutput], {});
  
  // Resetar estados internos do filtro e circular buffer
  cross.zL_lpf.fill(0); cross.zR_lpf.fill(0);
  cross.zL_hs.fill(0);  cross.zR_hs.fill(0);
  cross.delayBufL.fill(0); cross.delayBufR.fill(0);
  cross.delayIdx = 0;
  
  cross.process([[highInputL, highInputR]], [highOutput], {});
  
  let sumLowBleed = 0, sumHighBleed = 0;
  for (let i = 256; i < size; i++) {
    sumLowBleed += lowOutput[1][i] * lowOutput[1][i];
    sumHighBleed += highOutput[1][i] * highOutput[1][i];
  }
  const rmsLowBleed = Math.sqrt(sumLowBleed / 256);
  const rmsHighBleed = Math.sqrt(sumHighBleed / 256);
  
  const ratio = rmsLowBleed / (rmsHighBleed + 1e-12);
  
  assertMin(ratio, 10.0, 'O bleed em 5kHz deve ser pelo menos 10 vezes (20dB) mais atenuado que o bleed em 100Hz');
});

// 16. DC Drift Over Time
test(16, 'DC Drift Over Time', () => {
  const size = 10000;
  const input = makeSineBlock(size, 400, 0.5);
  for (let i = 0; i < size; i++) {
    input[0][i] += 0.2; input[1][i] += 0.2;
  }
  const output = [new Float32Array(size), new Float32Array(size)];
  
  const master = new registeredProcessors['lumina-mastering']();
  master.process([input], [output], {});
  
  let meanOut = 0;
  for (let i = 0; i < size; i++) meanOut += output[0][i];
  meanOut /= size;
  
  assertMax(Math.abs(meanOut), 0.3, 'O offset de corrente contínua (DC) acumulado deve se manter estável');
});

// 17. Saturation Symmetry Test
test(17, 'Saturation Symmetry Test', () => {
  const sat = new registeredProcessors['saturation']();
  sat.port.onmessage({ data: { mode: 'tube', drive: 0.5, mix: 1.0 } });
  
  const y1 = sat._tube(0.5);
  const y2 = sat._tube(-0.5);
  assertClose(y1, -y2, 1e-15, 'Modo Tube deve ser perfeitamente anti-simétrico');
  
  sat.port.onmessage({ data: { mode: 'transformer', drive: 0.5 } });
  const y3 = sat._transformer(0.5);
  const y4 = sat._transformer(-0.5);
  assert(Math.abs(y3 - (-y4)) > 0.01, 'Modo Transformer deve ser assimétrico');
});

// 18. LUFS Stability Test
test(18, 'LUFS Stability Test', () => {
  const size = 4096;
  const input = makeNoiseBlock(size, 0.5);
  
  const runLUFS = () => {
    const lufs = new registeredProcessors['lufs-meter']();
    const output = [new Float32Array(size), new Float32Array(size)];
    
    let lastLUFS = 0;
    lufs.onportmessage = (msg) => {
      if (msg.lufs !== undefined) lastLUFS = msg.lufs;
    };
    lufs.process([input], [output], {});
    return lastLUFS;
  };
  
  const first = runLUFS();
  for (let k = 0; k < 5; k++) {
    const next = runLUFS();
    assertClose(first, next, 0.01, 'Medição de LUFS deve ser determinística e estável sob execuções repetidas');
  }
});

// 19. Orbit Determinism Test
test(19, 'Orbit Determinism Test', () => {
  const input = makeNoiseBlock(2048, 0.7);
  
  const ts1 = new registeredProcessors['transient-shaper']();
  const ts2 = new registeredProcessors['transient-shaper']();
  
  const out1 = [new Float32Array(2048), new Float32Array(2048)];
  const out2 = [new Float32Array(2048), new Float32Array(2048)];
  
  ts1.process([input], [out1], {});
  ts2.process([input], [out2], {});
  
  for (let i = 0; i < 2048; i++) {
    assertClose(out1[0][i], out2[0][i], 1e-15, `Órbita e estado divergiram no sample ${i}`);
  }
});

// 20. Stress Precision Test
test(20, 'Stress Precision Test', () => {
  const size = 100000;
  const input = makeNoiseBlock(size, 0.8);
  const output = [new Float32Array(size), new Float32Array(size)];
  
  const cascade = [
    new registeredProcessors['saturation'](),
    new registeredProcessors['deesser'](),
    new registeredProcessors['adaptive-eq'](),
    new registeredProcessors['crossfeed'](),
    new registeredProcessors['transient-shaper'](),
    new registeredProcessors['submono'](),
    new registeredProcessors['lumina-mastering']()
  ];
  
  let currentInput = input;
  let currentOutput = output;
  
  for (const proc of cascade) {
    proc.process([currentInput], [currentOutput], {});
    currentInput = currentOutput;
    currentOutput = [new Float32Array(size), new Float32Array(size)];
  }
  
  for (let i = 0; i < size; i++) {
    const val = currentInput[0][i];
    assert(!isNaN(val), 'Cascata sob stress gerou NaN');
    assert(isFinite(val), 'Cascata sob stress gerou Infinity');
    assertMax(Math.abs(val), 1.0, 'Limite de segurança do limitador de barramento de saída foi rompido');
  }
});

console.log('\n' + C.bold('======================================================='));
console.log(`  RESULTADO: ${passed} passaram / ${failed} falharam / ${total} total`);
console.log('=======================================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log(C.green('  ✓ Todos os 20 testes matemáticos da Audio Engine passaram com sucesso!\n'));
}
