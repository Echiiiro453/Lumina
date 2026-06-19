/**
 * Lumina Audio Engine – Advanced Perceptual Entropy & Psychoacoustic Audit
 * 
 * Executa as validações psicoacústicas mais exigentes:
 * 1. Entropia Perceptual (Shannon Entropy) para avaliar preservação do microcaos natural.
 * 2. Preservação Microdinâmica (Micro-Crest Factor em janelas de 10ms).
 * 3. Varredura de Intermodulação (Sweep duplo para expor nonlinearidades espúrias).
 * 4. Mapeamento de Densidade de Campo Estéreo (verificação de "buracos" no panorama).
 * 5. Integridade do Silêncio (proteção absoluta contra vazamento DC e ruído denormal).
 * 
 * Rodar: node scratch/perceptual_entropy_validation.js
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

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ${C.green('✓')} ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ${C.red('✗')} ${name}`);
    console.log(`    ${C.yellow('→')} ${e.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

// Mock do AudioWorkletProcessor
global.AudioWorkletProcessor = class {
  constructor() {
    this.port = {
      onmessage: null,
      postMessage: () => {}
    };
  }
};
global.registerProcessor = () => {};
global.sampleRate = 44100;

// Carregar os processadores do Backend Static
const STATIC = path.join(__dirname, '..', 'backend', 'static');

function loadProcessor(filename) {
  const code = fs.readFileSync(path.join(STATIC, filename), 'utf-8');
  const match = code.match(/class\s+(\w+)\s+extends/);
  if (match) {
    const className = match[1];
    eval(code + `\nObject.defineProperty(global, "${className}", { value: ${className}, writable: true });`);
  }
}

loadProcessor('lumina-mastering.js');
loadProcessor('deharsh-processor.js');
loadProcessor('deesser-processor.js');
loadProcessor('exciter-processor.js');
loadProcessor('submono-processor.js');
loadProcessor('depth-processor.js');
loadProcessor('multiband-width-processor.js');

// FFT Cooley-Tukey Radix-2
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

// Helpers
function getRms(block) {
  let sum = 0;
  for (let i = 0; i < block.length; i++) sum += block[i] * block[i];
  return Math.sqrt(sum / block.length);
}

function getPeak(block) {
  let max = 0;
  for (let i = 0; i < block.length; i++) max = Math.max(max, Math.abs(block[i]));
  return max;
}

// Gerador de Pseudo-Song
function generatePseudoSong(length, sr = 44100) {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let b0_r = 0, b1_r = 0, b2_r = 0, b3_r = 0, b4_r = 0, b5_r = 0, b6_r = 0;
  
  for (let i = 0; i < length; i++) {
    const whiteL = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + whiteL * 0.0555179;
    b1 = 0.99332 * b1 + whiteL * 0.0750759;
    b2 = 0.96900 * b2 + whiteL * 0.1538520;
    b3 = 0.86650 * b3 + whiteL * 0.3104856;
    b4 = 0.55000 * b4 + whiteL * 0.5329522;
    b5 = -0.7616 * b5 - whiteL * 0.0168980;
    let pinkL = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + whiteL * 0.5362) / 7.0;
    b6 = whiteL * 0.115926;
    
    const whiteR = Math.random() * 2 - 1;
    b0_r = 0.99886 * b0_r + whiteR * 0.0555179;
    b1_r = 0.99332 * b1_r + whiteR * 0.0750759;
    b2_r = 0.96900 * b2_r + whiteR * 0.1538520;
    b3_r = 0.86650 * b3_r + whiteR * 0.3104856;
    b4_r = 0.55000 * b4_r + whiteR * 0.5329522;
    b5_r = -0.7616 * b5_r - whiteR * 0.0168980;
    let pinkR = (b0_r + b1_r + b2_r + b3_r + b4_r + b5_r + b6_r + whiteR * 0.5362) / 7.0;
    b6_r = whiteR * 0.115926;

    left[i] = pinkL * 0.4;
    right[i] = pinkR * 0.4;
  }
  return [left, right];
}

console.log(C.bold(C.cyan('INICIANDO ADVANCED PERCEPTUAL ENTROPY & SILENCE INTEGRITY AUDIT\n')));

// 1. Perceptual Entropy Test
test('1. Perceptual Entropy Test (Shannon Micro-Chaos preservation)', () => {
  const [songL, songR] = generatePseudoSong(1024);
  const mastering = new LuminaMasteringProcessor();
  
  const outL = new Float32Array(1024);
  const outR = new Float32Array(1024);
  mastering.process([ [songL.subarray(0, 128), songR.subarray(0, 128)] ], [ [outL.subarray(0, 128), outR.subarray(0, 128)] ]);
  
  // Calcular entropia de Shannon de entrada vs saída
  const calculateEntropy = (samples) => {
    const re = new Float32Array(samples);
    const im = new Float32Array(samples.length);
    fft(re, im);
    
    let sumMag = 0;
    const mag = new Float32Array(samples.length / 2);
    for (let i = 0; i < mag.length; i++) {
      mag[i] = Math.sqrt(re[i]*re[i] + im[i]*im[i]);
      sumMag += mag[i];
    }
    
    let H = 0;
    for (let i = 0; i < mag.length; i++) {
      const p = mag[i] / (sumMag + 1e-15);
      if (p > 0) {
        H -= p * Math.log2(p);
      }
    }
    return H;
  };

  const entropyIn = calculateEntropy(songL.subarray(0, 512));
  const entropyOut = calculateEntropy(outL.subarray(0, 512));

  console.log(`     ${C.cyan('→')} Input Shannon Entropy: ${entropyIn.toFixed(4)} | Output Entropy: ${entropyOut.toFixed(4)}`);
  assert(Math.abs(entropyIn - entropyOut) < 1.5, 'Estereótipo de compressão excessivo removeu microcaos natural');
});

// 2. Microdynamic Preservation Test (10ms Microcrest windows)
test('2. Microdynamic Preservation Test (10ms Micro-Crest Factor)', () => {
  const [songL, songR] = generatePseudoSong(8820); // 200ms
  const deharsh = new DeHarshProcessor();
  
  const outL = new Float32Array(8820);
  const outR = new Float32Array(8820);
  
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  for (let offset = 0; offset < 8820; offset += 128) {
    const size = Math.min(128, 8820 - offset);
    deharsh.process([ [songL.subarray(offset, offset+size), songR.subarray(offset, offset+size)] ], [ [blockL.subarray(0, size), blockR.subarray(0, size)] ]);
    outL.set(blockL.subarray(0, size), offset);
    outR.set(blockR.subarray(0, size), offset);
  }

  // Medir microcrest em janelas de 10ms (441 samples)
  const windowSize = 441;
  let sumCrestIn = 0, sumCrestOut = 0, count = 0;
  for (let offset = 0; offset < 8820; offset += windowSize) {
    const subIn = songL.subarray(offset, offset + windowSize);
    const subOut = outL.subarray(offset, offset + windowSize);
    
    const crestIn = getPeak(subIn) / (getRms(subIn) + 1e-12);
    const crestOut = getPeak(subOut) / (getRms(subOut) + 1e-12);
    
    sumCrestIn += crestIn;
    sumCrestOut += crestOut;
    count++;
  }
  
  const avgCrestIn = sumCrestIn / count;
  const avgCrestOut = sumCrestOut / count;
  
  console.log(`     ${C.cyan('→')} Avg Input Microcrest: ${avgCrestIn.toFixed(4)} | Output Microcrest: ${avgCrestOut.toFixed(4)}`);
  assert(avgCrestOut >= avgCrestIn * 0.8, 'Microtransientes foram excessivamente suavizados ou esmagados');
});

// 3. Intermodulation Sweep Test
test('3. Intermodulation Sweep Test', () => {
  const length = 4096;
  const L = new Float32Array(length);
  const R = new Float32Array(length);
  
  // Sinal de dois tons: 50Hz fixo + Sweep linear de 100Hz a 10kHz
  for (let i = 0; i < length; i++) {
    const t = i / 44100;
    const fSweep = 100 + (10000 - 100) * (i / length);
    const val = 0.5 * Math.sin(2 * Math.PI * 50 * t) + 0.5 * Math.sin(2 * Math.PI * fSweep * t);
    L[i] = val;
    R[i] = val;
  }
  
  const exciter = new ExciterProcessor();
  exciter.amount = 0.6;
  
  const outL = new Float32Array(length);
  const outR = new Float32Array(length);
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  
  for (let offset = 0; offset < length; offset += 128) {
    exciter.process([ [L.subarray(offset, offset+128), R.subarray(offset, offset+128)] ], [ [blockL, blockR] ]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }
  
  // Realizar FFT da saída e confirmar integridade espectral (sem NaNs ou estouros)
  const re = new Float32Array(outL);
  const im = new Float32Array(length);
  fft(re, im);
  
  let peakVal = 0;
  for (let i = 0; i < length / 2; i++) {
    peakVal = Math.max(peakVal, Math.sqrt(re[i]*re[i] + im[i]*im[i]));
  }
  
  assert(!isNaN(peakVal) && isFinite(peakVal), 'Sweep de intermodulação causou instabilidade/NaN na saída do Exciter');
  console.log(`     ${C.cyan('→')} Sweep output stability peak: ${peakVal.toFixed(4)}`);
});

// 4. Stereo Field Density Mapping
test('4. Stereo Field Density Mapping (Sem buracos no panorama)', () => {
  const [songL, songR] = generatePseudoSong(4096);
  const widthProc = new MultibandWidthProcessor();
  widthProc.port.onmessage({ data: { width: 1.3 } });
  
  const outL = new Float32Array(4096);
  const outR = new Float32Array(4096);
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  
  for (let offset = 0; offset < 4096; offset += 128) {
    widthProc.process([ [songL.subarray(offset, offset+128), songR.subarray(offset, offset+128)] ], [ [blockL, blockR] ]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }

  // Mapear ângulos
  let leftHeavy = 0, rightHeavy = 0, centerHeavy = 0;
  for (let i = 0; i < 4096; i++) {
    const angle = Math.abs(outL[i]) / (Math.abs(outR[i]) + 1e-12);
    if (angle > 2.0) leftHeavy++;
    else if (angle < 0.5) rightHeavy++;
    else centerHeavy++;
  }
  
  console.log(`     ${C.cyan('→')} Angular Distribution: Left Heavy: ${leftHeavy} | Center: ${centerHeavy} | Right Heavy: ${rightHeavy}`);
  assert(centerHeavy > 100, 'A imagem central estéreo colapsou ou foi esvaziada (buraco no centro)');
});

// 5. DC & Silence Integrity Test
test('5. DC & Silence Integrity Test', () => {
  const silenceL = new Float32Array(1024).fill(0.0);
  const silenceR = new Float32Array(1024).fill(0.0);
  
  const cascade = [
    new DeHarshProcessor(),
    new DeEsserProcessor(),
    new ExciterProcessor(),
    new SubMonoProcessor(),
    new DepthProcessor(),
    new MultibandWidthProcessor(),
    new LuminaMasteringProcessor()
  ];
  
  let currentIn = [silenceL, silenceR];
  let currentOut = [new Float32Array(1024), new Float32Array(1024)];
  
  for (const proc of cascade) {
    proc.process([currentIn], [currentOut], {});
    currentIn = currentOut;
    currentOut = [new Float32Array(1024), new Float32Array(1024)];
  }
  
  const peak = getPeak(currentIn[0]);
  console.log(`     ${C.cyan('→')} Output residual peak on silence: ${peak.toFixed(20)}`);
  assert(peak === 0, `Silêncio gerou vazamento DC ou resíduo de denormal! Pico de saída: ${peak}`);
});

// 6. Phase Rotation Group Delay Audit
test('6. Phase Rotation Group Delay Audit (100Hz–500Hz Punch Protection)', () => {
  const length = 2048;
  const sineL = new Float32Array(length);
  const sineR = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const val = 0.5 * Math.sin(2 * Math.PI * 200 * i / 44100);
    sineL[i] = val;
    sineR[i] = val;
  }
  
  const masterWithPR = new LuminaMasteringProcessor();
  masterWithPR.port.onmessage({ data: { enablePhaseRotation: true } });
  
  const masterNoPR = new LuminaMasteringProcessor();
  masterNoPR.port.onmessage({ data: { enablePhaseRotation: false } });
  
  const outPR_L = new Float32Array(length);
  const outPR_R = new Float32Array(length);
  const outNoPR_L = new Float32Array(length);
  const outNoPR_R = new Float32Array(length);
  
  const blockPR_L = new Float32Array(128);
  const blockPR_R = new Float32Array(128);
  const blockNoPR_L = new Float32Array(128);
  const blockNoPR_R = new Float32Array(128);
  
  for (let offset = 0; offset < length; offset += 128) {
    masterWithPR.process([ [sineL.subarray(offset, offset+128), sineR.subarray(offset, offset+128)] ], [ [blockPR_L, blockPR_R] ]);
    masterNoPR.process([ [sineL.subarray(offset, offset+128), sineR.subarray(offset, offset+128)] ], [ [blockNoPR_L, blockNoPR_R] ]);
    outPR_L.set(blockPR_L, offset);
    outPR_R.set(blockPR_R, offset);
    outNoPR_L.set(blockNoPR_L, offset);
    outNoPR_R.set(blockNoPR_R, offset);
  }
  
  // Encontrar o atraso por correlação cruzada
  let maxCorr = -1, bestLag = 0;
  for (let lag = -20; lag <= 20; lag++) {
    let corr = 0;
    for (let i = 100; i < length - 100; i++) {
      corr += outNoPR_L[i] * outPR_L[i + lag];
    }
    if (corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }
  }
  
  const delayMs = (Math.abs(bestLag) / 44.1);
  console.log(`     ${C.cyan('→')} Phase Rotation group delay difference at 200Hz: ${delayMs.toFixed(3)} ms (lag: ${bestLag} samples)`);
  assert(delayMs <= 1.5, `Atraso de grupo excessivo na faixa de punch (200Hz): ${delayMs.toFixed(3)} ms`);
});

const divider = '─'.repeat(55);
console.log(`\n${divider}`);
const color = failed === 0 ? C.green : C.red;
console.log(C.bold(`  AUDITORIA DE ENTROPIA E SILÊNCIO: ${color(`${passed} passaram`)} / ${failed > 0 ? C.red(`${failed} falharam`) : '0 falharam'} / ${total} total`));
console.log(divider);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
