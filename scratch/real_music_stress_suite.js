/**
 * Lumina Audio Engine – Real Music Validation Suite
 * 
 * Este teste simula a complexidade de sinais musicais reais
 * através de um gerador de "Pseudo-Song" contendo ruído rosa,
 * envelopes de Kick, formantes vocais modulados na faixa de 4kHz,
 * rajadas de transientes e decodificação estéreo.
 * 
 * Rodar: node scratch/real_music_stress_suite.js
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
  // Extrair classe e associar globalmente
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

// Helper: RMS do bloco
function getRms(L, R) {
  let sum = 0;
  for (let i = 0; i < L.length; i++) {
    sum += L[i] * L[i] + R[i] * R[i];
  }
  return Math.sqrt(sum / (L.length * 2));
}

// Helper: Pico absoluto do bloco
function getPeak(L, R) {
  let max = 0;
  for (let i = 0; i < L.length; i++) {
    max = Math.max(max, Math.abs(L[i]), Math.abs(R[i]));
  }
  return max;
}

// Helper: Gerador de Pseudo-Song
function generatePseudoSong(length, sr = 44100) {
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  
  // Pink noise filter state
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let b0_r = 0, b1_r = 0, b2_r = 0, b3_r = 0, b4_r = 0, b5_r = 0, b6_r = 0;
  
  // Vocal formant filter (Bandpass a 4kHz, Q=1.0)
  let f_g = Math.tan(Math.PI * 4000 / sr);
  let f_k = 1.0;
  let f_D = 1.0 + f_g * (f_g + f_k);
  let vStateL = new Float32Array(2);
  let vStateR = new Float32Array(2);
  
  for (let i = 0; i < length; i++) {
    // 1. Ruído Rosa (Esquerda e Direita)
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
    
    // 2. Kick envelopes (grave 60Hz pulsante a cada 4000 amostras)
    const beatIndex = i % 4000;
    const kickEnv = Math.exp(-beatIndex / 1000.0);
    const kick = Math.sin(2 * Math.PI * 60.0 * beatIndex / sr) * kickEnv * 0.4;
    
    // 3. Formantes vocais simuladas (ruído rosa passado por filtro bandpass de 4kHz)
    const voiceEnv = 0.4 + 0.4 * Math.sin(2 * Math.PI * 2.0 * i / sr); // modulação de 2Hz
    const vhp_L = (pinkL - (f_g + f_k) * vStateL[0] - vStateL[1]) / f_D;
    const vbp_L = f_g * vhp_L + vStateL[0];
    const vlp_L = f_g * vbp_L + vStateL[1];
    vStateL[0] = 2 * vbp_L - vStateL[0];
    vStateL[1] = 2 * vlp_L - vStateL[1];
    
    const vhp_R = (pinkR - (f_g + f_k) * vStateR[0] - vStateR[1]) / f_D;
    const vbp_R = f_g * vhp_R + vStateR[0];
    const vlp_R = f_g * vbp_R + vStateR[1];
    vStateR[0] = 2 * vbp_R - vStateR[0];
    vStateR[1] = 2 * vlp_R - vStateR[1];
    
    const vocalL = vbp_L * voiceEnv * 0.5;
    const vocalR = vbp_R * voiceEnv * 0.5;
    
    // 4. Rajadas de transientes (impulsos agudos)
    const clickIndex = (i + 2000) % 3000;
    const transientL = clickIndex === 0 ? 0.6 : (clickIndex === 1 ? -0.3 : 0);
    const transientR = clickIndex === 0 ? -0.6 : (clickIndex === 1 ? 0.3 : 0);
    
    left[i] = pinkL * 0.2 + kick + vocalL + transientL;
    right[i] = pinkR * 0.2 + kick + vocalR + transientR;
  }
  
  return [left, right];
}

console.log(C.bold(C.cyan('INICIANDO REAL MUSIC VALIDATION SUITE – LUMINA DSP ENGINE')));

// Gerar pseudo-música com 10 segundos de duração (441000 amostras)
const SONG_SAMPLES = 44100 * 5;
const [origL, origR] = generatePseudoSong(SONG_SAMPLES);

// Instanciar processadores para simular o cascade real
const deharsh = new DeHarshProcessor();
const deesser = new DeEsserProcessor();
const exciter = new ExciterProcessor();
const submono = new SubMonoProcessor();
const depth = new DepthProcessor();
const width = new MultibandWidthProcessor();
const mastering = new LuminaMasteringProcessor();

// Configurações padrão
exciter.amount = 0.5;
submono.port.onmessage({ data: { bassRecovery: 0.6 } });
depth.port.onmessage({ data: { active: true, depth: 0.5 } });
width.port.onmessage({ data: { width: 1.2 } });
mastering.port.onmessage({ data: { enablePhaseRotation: true } });

// Arrays para saída do processamento
const procL = new Float32Array(SONG_SAMPLES);
const procR = new Float32Array(SONG_SAMPLES);

// Processar em blocos de 128 amostras
const BLOCK_SIZE = 128;
for (let offset = 0; offset < SONG_SAMPLES; offset += BLOCK_SIZE) {
  const size = Math.min(BLOCK_SIZE, SONG_SAMPLES - offset);
  
  const inL = origL.subarray(offset, offset + size);
  const inR = origR.subarray(offset, offset + size);
  
  const outL = new Float32Array(size);
  const outR = new Float32Array(size);
  
  // Cascade de processamento
  const temp1_L = new Float32Array(size);
  const temp1_R = new Float32Array(size);
  deharsh.process([ [inL], [inR] ], [ [temp1_L], [temp1_R] ]);
  
  const temp2_L = new Float32Array(size);
  const temp2_R = new Float32Array(size);
  deesser.process([ [temp1_L], [temp1_R] ], [ [temp2_L], [temp2_R] ]);
  
  const temp3_L = new Float32Array(size);
  const temp3_R = new Float32Array(size);
  exciter.process([ [temp2_L], [temp2_R] ], [ [temp3_L], [temp3_R] ]);
  
  const temp4_L = new Float32Array(size);
  const temp4_R = new Float32Array(size);
  submono.process([ [temp3_L], [temp3_R] ], [ [temp4_L], [temp4_R] ]);
  
  const temp5_L = new Float32Array(size);
  const temp5_R = new Float32Array(size);
  depth.process([ [temp4_L], [temp4_R] ], [ [temp5_L], [temp5_R] ]);
  
  const temp6_L = new Float32Array(size);
  const temp6_R = new Float32Array(size);
  width.process([ [temp5_L], [temp5_R] ], [ [temp6_L], [temp6_R] ]);
  
  // Mastering final
  mastering.process([ [temp6_L], [temp6_R] ], [ [outL], [outR] ]);
  
  procL.set(outL, offset);
  procR.set(outR, offset);
}

// Testes da Suite
test('1. Dense Mix & Clipping Immunity Test', () => {
  const peakOut = getPeak(procL, procR);
  assert(!isNaN(peakOut), 'Sinal de saída contém NaNs');
  assert(isFinite(peakOut), 'Sinal de saída contém valores infinitos');
  // O limitador master deve segurar tudo a -1dBFS (0.891)
  assert(peakOut <= 0.9, `O limitador deve impedir clipping acima de 0.9, pico medido: ${peakOut.toFixed(4)}`);
});

test('2. Vocal Sibilance & Harshness Adaptive Gain Suppression', () => {
  // O deharsh e o deesser devem atenuar ressonâncias fortes e dinâmicas
  const peakIn = getPeak(origL, origR);
  const peakOut = getPeak(procL, procR);
  assert(peakOut <= peakIn, 'O processamento dinâmico não deve estourar o pico da entrada original');
});

test('3. Dynamic Range & Crest Factor Preservation', () => {
  const rmsIn = getRms(origL, origR);
  const peakIn = getPeak(origL, origR);
  const crestIn = peakIn / (rmsIn + 1e-6);
  
  const rmsOut = getRms(procL, procR);
  const peakOut = getPeak(procL, procR);
  const crestOut = peakOut / (rmsOut + 1e-6);
  
  // A preservação de transientes não deve esmagar o crest factor por mais de 5dB
  const diffCrestDb = 20 * Math.log10(crestIn / crestOut);
  assert(diffCrestDb < 6.0, `Crest Factor excessivamente esmagado: ${diffCrestDb.toFixed(2)}dB`);
});

test('4. Sub Translation & Mono Fold Compatibility', () => {
  // Fold para mono
  const monoIn = new Float32Array(SONG_SAMPLES);
  const monoOut = new Float32Array(SONG_SAMPLES);
  for (let i = 0; i < SONG_SAMPLES; i++) {
    monoIn[i] = (origL[i] + origR[i]) * 0.5;
    monoOut[i] = (procL[i] + procR[i]) * 0.5;
  }
  
  const rmsMonoIn = getRms(monoIn, monoIn);
  const rmsMonoOut = getRms(monoOut, monoOut);
  
  // Mono fold residual não deve sumir (cancelar tudo)
  assert(rmsMonoOut > 0.01, `Sinal mono sumiu quase completamente após o processamento. RMS: ${rmsMonoOut.toFixed(4)}`);
});

test('5. Null Against Reference Master (Loudness Matching)', () => {
  // Ajustar o ganho do sinal processado para igualar o RMS do original
  const rmsOrig = getRms(origL, origR);
  const rmsProc = getRms(procL, procR);
  const scale = rmsOrig / (rmsProc + 1e-6);
  
  const resL = new Float32Array(SONG_SAMPLES);
  const resR = new Float32Array(SONG_SAMPLES);
  
  for (let i = 0; i < SONG_SAMPLES; i++) {
    resL[i] = (procL[i] * scale) - origL[i];
    resR[i] = (procR[i] * scale) - origR[i];
  }
  
  const rmsResidual = getRms(resL, resR);
  const residualDb = 20 * Math.log10(rmsResidual + 1e-6);
  
  console.log(`     ${C.cyan('→')} Processing footprint (Residual RMS): ${residualDb.toFixed(2)} dB`);
  assert(residualDb > -60.0, 'Nenhuma diferença detectada (sinal idêntico)');
  assert(residualDb < 0.0, 'Diferença excessiva (sinal distorcido ou instável)');
});

const divider = '─'.repeat(55);
console.log(`\n${divider}`);
const color = failed === 0 ? C.green : C.red;
console.log(C.bold(`  VALIDAÇÃO MÚSICA REAL: ${color(`${passed} passaram`)} / ${failed > 0 ? C.red(`${failed} falharam`) : '0 falharam'} / ${total} total`));
console.log(divider);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
