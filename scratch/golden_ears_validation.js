/**
 * Lumina Audio Engine – Golden Ears & Inter-Processor Stress Suite
 * 
 * Este validador analisa as interações complexas entre processadores,
 * estressa parâmetros dinâmicos para verificar ruído de zíper e cliques,
 * calcula a correlação de fase estéreo, mede o blur temporal e avalia
 * a fadiga auditiva com métricas espectrais acumuladas.
 * 
 * Rodar: node scratch/golden_ears_validation.js
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

// Carregar os processadores
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

// Helpers de geração de sinal
function getRms(L, R) {
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    sum += L[i] * L[i] + R[i] * R[i];
  }
  return Math.sqrt(sum / (L.length * 2));
}

function getPeak(L, R) {
  let max = 0;
  for (let i = 0; i < L.length; i++) {
    max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  }
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

    // Adiciona modulação vocal a 3.5kHz
    const voiceMod = 0.3 * Math.sin(2 * Math.PI * 1000 * i / sr);
    left[i] = pinkL * 0.3 + voiceMod;
    right[i] = pinkR * 0.3 - voiceMod; // estéreo oposto
  }
  return [left, right];
}

console.log(C.bold(C.cyan('INICIANDO GOLDEN EARS & INTER-PROCESSOR STRESS SUITE\n')));

// 1. Inter-Processor Interaction Test
test('1. Inter-Processor Interaction Test (Exciter vs DeHarsh Matrix)', () => {
  const [songL, songR] = generatePseudoSong(8192);
  
  const processChain = (useExciter, useDeHarsh) => {
    const ex = new ExciterProcessor();
    const dh = new DeHarshProcessor();
    
    ex.amount = useExciter ? 0.8 : 0.0;
    dh.port.onmessage({ data: { active: useDeHarsh } });
    
    const outL = new Float32Array(8192);
    const outR = new Float32Array(8192);
    
    const tempL = new Float32Array(128);
    const tempR = new Float32Array(128);
    const blockL = new Float32Array(128);
    const blockR = new Float32Array(128);
    
    for (let offset = 0; offset < 8192; offset += 128) {
      const inL = songL.subarray(offset, offset + 128);
      const inR = songR.subarray(offset, offset + 128);
      
      dh.process([[inL], [inR]], [[tempL], [[tempR]]]);
      ex.process([[tempL], [tempR]], [[blockL], [blockR]]);
      
      outL.set(blockL, offset);
      outR.set(blockR, offset);
    }
    return [outL, outR];
  };

  const [excOnlyL, excOnlyR] = processChain(true, false);
  const [dhOnlyL, dhOnlyR] = processChain(false, true);
  const [bothL, bothR] = processChain(true, true);

  const rmsExc = getRms(excOnlyL, excOnlyR);
  const rmsDh = getRms(dhOnlyL, dhOnlyR);
  const rmsBoth = getRms(bothL, bothR);

  // DeHarsh dinâmico deve domar a saturação extra do Exciter
  assert(rmsBoth <= rmsExc * 1.05, 'Loop de realimentação/mascaramento entre DeHarsh e Exciter aumentou de forma anormal o ganho da chain');
  console.log(`     ${C.cyan('→')} Exciter-only RMS: ${rmsExc.toFixed(4)} | Both RMS: ${rmsBoth.toFixed(4)}`);
});

// 2. Parameter Automation Stress Test
test('2. Parameter Automation Stress Test (Sem Zipper Noise)', () => {
  const [songL, songR] = generatePseudoSong(16384);
  const widthProc = new MultibandWidthProcessor();
  
  const outL = new Float32Array(16384);
  const outR = new Float32Array(16384);
  
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  
  // Varrer o parâmetro width de forma agressiva a cada bloco para simular zipper noise
  for (let offset = 0; offset < 16384; offset += 128) {
    const inL = songL.subarray(offset, offset + 128);
    const inR = songR.subarray(offset, offset + 128);
    
    const targetWidth = 1.0 + 1.0 * Math.sin(2 * Math.PI * (offset / 16384));
    widthProc.port.onmessage({ data: { width: targetWidth } });
    
    widthProc.process([[inL], [inR]], [[blockL], [blockR]]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }

  // Medir derivadas máximas (saltos de zíper rápidos)
  let maxDerivative = 0;
  for (let i = 1; i < 16384; i++) {
    const dL = Math.abs(outL[i] - outL[i - 1]);
    const dR = Math.abs(outR[i] - outR[i - 1]);
    maxDerivative = Math.max(maxDerivative, dL, dR);
  }
  
  // Zipper noise cria picos agudos de derivada maiores que 1.5
  assert(maxDerivative < 1.0, `Zipper noise ou instabilidade de filtro detectada! Derivada máxima: ${maxDerivative.toFixed(4)}`);
  console.log(`     ${C.cyan('→')} Max output derivative under sweep: ${maxDerivative.toFixed(4)}`);
});

// 3. Stereo Phase Correlation Monitor
test('3. Phase Correlation Monitor', () => {
  const [songL, songR] = generatePseudoSong(8192);
  const widthProc = new MultibandWidthProcessor();
  
  // Configurar alargamento largo
  widthProc.port.onmessage({ data: { width: 1.5 } });
  
  const outL = new Float32Array(8192);
  const outR = new Float32Array(8192);
  
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  for (let offset = 0; offset < 8192; offset += 128) {
    widthProc.process([[songL.subarray(offset, offset+128)], [songR.subarray(offset, offset+128)]], [[blockL], [blockR]]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }
  
  // Calcular correlação de fase
  let sumLR = 0, sumLL = 0, sumRR = 0;
  for (let i = 0; i < 8192; i++) {
    sumLR += outL[i] * outR[i];
    sumLL += outL[i] * outL[i];
    sumRR += outR[i] * outR[i];
  }
  
  const correlation = sumLR / Math.sqrt(sumLL * sumRR + 1e-15);
  
  console.log(`     ${C.cyan('→')} Phase Correlation (Widened): ${correlation.toFixed(4)}`);
  assert(correlation >= 0.0, `Correlação fora de fase crítica (<0): ${correlation.toFixed(4)}`);
});

// 4. Spectral Delta (Fatigue Guard)
test('4. Spectral Delta (Fatigue Guard no range 4kHz-8kHz)', () => {
  const [songL, songR] = generatePseudoSong(1024);
  const deharsh = new DeHarshProcessor();
  
  const outL = new Float32Array(1024);
  const outR = new Float32Array(1024);
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  
  for (let offset = 0; offset < 1024; offset += 128) {
    deharsh.process([[songL.subarray(offset, offset+128)], [songR.subarray(offset, offset+128)]], [[blockL], [blockR]]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }
  
  // FFT de entrada e saída
  const reIn = new Float32Array(songL.subarray(0, 1024));
  const imIn = new Float32Array(1024);
  fft(reIn, imIn);
  
  const reOut = new Float32Array(outL.subarray(0, 1024));
  const imOut = new Float32Array(1024);
  fft(reOut, imOut);
  
  // Integrar energia entre 4kHz e 8kHz (índices 93 a 186 para SR=44100, N=1024)
  let energyIn = 0, energyOut = 0;
  for (let k = 93; k <= 186; k++) {
    energyIn += reIn[k]*reIn[k] + imIn[k]*imIn[k];
    energyOut += reOut[k]*reOut[k] + imOut[k]*imOut[k];
  }
  
  const deltaDb = 10 * Math.log10((energyOut + 1e-15) / (energyIn + 1e-15));
  console.log(`     ${C.cyan('→')} Spectral delta in fatigue zone (4k-8k): ${deltaDb.toFixed(2)} dB`);
  assert(deltaDb <= 1.0, `Excesso de energia/fadiga na zona de harshness: ${deltaDb.toFixed(2)} dB`);
});

// 5. Temporal Blur (Transient Sharpness Preservation)
test('5. Temporal Blur (Transient Sharpness)', () => {
  // Criar trem de impulsos
  const impulse = new Float32Array(512);
  impulse[10] = 1.0; // Transiente agudo
  
  const depth = new DepthProcessor();
  depth.port.onmessage({ data: { active: true, depth: 0.8 } }); // Profundidade Far
  
  const outL = new Float32Array(512);
  const outR = new Float32Array(512);
  
  depth.process([[impulse], [impulse]], [[outL], [outR]]);
  
  // Encontrar o pico e verificar o decaimento em amostras adjacentes para garantir que o ataque não ficou "borrado"
  let peakIdx = 0;
  for (let i = 0; i < 512; i++) {
    if (Math.abs(outL[i]) > Math.abs(outL[peakIdx])) peakIdx = i;
  }
  
  // O pico deve estar próximo de 10
  assert(peakIdx >= 10 && peakIdx <= 15, `Pico transiente muito atrasado: sample ${peakIdx}`);
  
  // O sinal após 50 amostras deve decair de forma limpa (sem ringing difuso)
  const tailValue = Math.abs(outL[peakIdx + 50]);
  assert(tailValue < 0.05, `Ringing difuso detectado após o transiente: amplitude ${tailValue.toFixed(4)}`);
  console.log(`     ${C.cyan('→')} Transient peak at sample: ${peakIdx} | Post-impulse residual tail: ${tailValue.toFixed(6)}`);
});

// 6. Stereo Collapse Map
test('6. Stereo Collapse Map Integrity', () => {
  const [songL, songR] = generatePseudoSong(2048);
  const widthProc = new MultibandWidthProcessor();
  
  const testWidth = (w) => {
    widthProc.port.onmessage({ data: { width: w } });
    const outL = new Float32Array(2048);
    const outR = new Float32Array(2048);
    const blockL = new Float32Array(128);
    const blockR = new Float32Array(128);
    
    for (let offset = 0; offset < 2048; offset += 128) {
      widthProc.process([[songL.subarray(offset, offset+128)], [songR.subarray(offset, offset+128)]], [[blockL], [blockR]]);
      outL.set(blockL, offset);
      outR.set(blockR, offset);
    }
    
    // Fold para mono
    const mono = new Float32Array(2048);
    for (let i = 0; i < 2048; i++) mono[i] = (outL[i] + outR[i]) * 0.5;
    return getRms(mono, mono);
  };
  
  const rms0 = testWidth(0.0);   // Mono total
  const rms50 = testWidth(0.5);  // Width moderado
  const rms100 = testWidth(1.0); // Normal
  const rms150 = testWidth(1.5); // Alargamento amplo
  
  console.log(`     ${C.cyan('→')} Mono Fold RMS: Mono: ${rms0.toFixed(4)} | 50%: ${rms50.toFixed(4)} | 100%: ${rms100.toFixed(4)} | 150%: ${rms150.toFixed(4)}`);
  assert(rms150 > rms100 * 0.5, 'Perda excessiva de compatibilidade mono ao alargar imagem estéreo');
});

// 7. Ear Fatigue Metric
test('7. Ear Fatigue Metric Monitor', () => {
  const [songL, songR] = generatePseudoSong(4096);
  const mastering = new LuminaMasteringProcessor();
  
  const outL = new Float32Array(4096);
  const outR = new Float32Array(4096);
  const blockL = new Float32Array(128);
  const blockR = new Float32Array(128);
  for (let offset = 0; offset < 4096; offset += 128) {
    mastering.process([[songL.subarray(offset, offset+128)], [songR.subarray(offset, offset+128)]], [[blockL], [blockR]]);
    outL.set(blockL, offset);
    outR.set(blockR, offset);
  }
  
  // FFT de saída
  const re = new Float32Array(outL.subarray(0, 1024));
  const im = new Float32Array(1024);
  fft(re, im);
  
  let fatigueEnergy = 0, totalEnergy = 0;
  for (let k = 1; k < 512; k++) {
    const mag = re[k]*re[k] + im[k]*im[k];
    totalEnergy += mag;
    // 2.5kHz a 8kHz (índices 58 a 186)
    if (k >= 58 && k <= 186) {
      fatigueEnergy += mag;
    }
  }
  
  const ratio = fatigueEnergy / (totalEnergy + 1e-15);
  console.log(`     ${C.cyan('→')} High-mid fatigue energy ratio: ${(ratio * 100).toFixed(2)}%`);
  assert(ratio < 0.40, `Métrica de fadiga acima do limite recomendado: ${(ratio * 100).toFixed(2)}%`);
});

const divider = '─'.repeat(55);
console.log(`\n${divider}`);
const color = failed === 0 ? C.green : C.red;
console.log(C.bold(`  GOLDEN EARS VALIDATION: ${color(`${passed} passaram`)} / ${failed > 0 ? C.red(`${failed} falharam`) : '0 falharam'} / ${total} total`));
console.log(divider);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
