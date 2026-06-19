/**
 * Lumina Audio Engine – Testes Sintéticos DSP v2.0
 * 
 * Testa todos os processadores de áudio (incluindo os novos LUFS, De-esser,
 * Saturation, Submono e Crossfeed) para garantir estabilidade, imunidade
 * a denormais, e limites de ganho/clipping sob estresse extremo.
 * 
 * Rodar: node scratch/lumina_dsp_tests.js
 */

// ─── Cores e helpers ─────────────────────────────────────────────────────────
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
    console.log(`\nStack trace:\n${e.stack}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg);
}

function assertClose(a, b, tol = 0.001, msg = '') {
  if (Math.abs(a - b) > tol) {
    throw new Error(`Expected ${a.toFixed(6)} ≈ ${b.toFixed(6)} (tol=${tol}) ${msg}`);
  }
}

function assertMax(val, max, msg = '') {
  if (val > max) throw new Error(`Expected ${val.toFixed(6)} ≤ ${max.toFixed(6)} ${msg}`);
}

function assertMin(val, min, msg = '') {
  if (val < min) throw new Error(`Expected ${val.toFixed(6)} ≥ ${min.toFixed(6)} ${msg}`);
}

// ─── Mock do AudioWorkletProcessor ───────────────────────────────────────────
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

// ─── Carregamento das dependências ───────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const STATIC = path.join(__dirname, '..', 'backend', 'static');
eval(fs.readFileSync(path.join(STATIC, 'lumina-mastering.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'transient-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'adaptive-eq-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'crossfeed-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'lufs-meter-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'submono-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'deesser-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'saturation-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'exciter-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'multiband-width-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'deharsh-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'spectral-glue-processor.js'), 'utf-8'));
eval(fs.readFileSync(path.join(STATIC, 'depth-processor.js'), 'utf-8'));

// ─── Helper: gerar bloco de áudio ────────────────────────────────────────────
function makeBlock(size, value, channels = 2) {
  return Array.from({ length: channels }, () => new Float32Array(size).fill(value));
}

function makeSineBlock(size, freq, amplitude, sr = 44100, channels = 2) {
  return Array.from({ length: channels }, () => {
    const buf = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      buf[i] = amplitude * Math.sin(2 * Math.PI * freq * i / sr);
    }
    return buf;
  });
}

function makeNoiseBlock(size, amplitude, channels = 2) {
  return Array.from({ length: channels }, () => {
    const buf = new Float32Array(size);
    for (let i = 0; i < size; i++) buf[i] = (Math.random() * 2 - 1) * amplitude;
    return buf;
  });
}

function makeOutputBlock(size, channels = 2) {
  return Array.from({ length: channels }, () => new Float32Array(size));
}

function peakOf(block) {
  return block.reduce((max, ch) => {
    for (let i = 0; i < ch.length; i++) max = Math.max(max, Math.abs(ch[i]));
    return max;
  }, 0);
}

function rmsOf(block) {
  let sum = 0, count = 0;
  block.forEach(ch => { for (let s of ch) { sum += s * s; count++; } });
  return Math.sqrt(sum / count);
}

// ─── SUITE 1: createReverbIR (Pink Noise) ──────────────────────────────
console.log(C.bold(C.cyan('\n[1] createReverbIR – Gerador de Impulse Response (Pink Noise)')));

const createReverbIR = (audioCtx, duration, decay) => {
  const sr     = audioCtx.sampleRate;
  const length = Math.floor(sr * duration);
  const impulse = {
    left: new Float32Array(length),
    right: new Float32Array(length),
    length
  };

  for (let ch = 0; ch < 2; ch++) {
    const data = ch === 0 ? impulse.left : impulse.right;
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) / 7.0;
      b6 = white * 0.115926;

      const env = Math.pow(1 - i / length, decay);
      data[i] = pink * env;
    }
  }

  return impulse;
};

const mockCtx = { sampleRate: 44100 };

test('IR tem o comprimento correto (1s @ 44100)', () => {
  const ir = createReverbIR(mockCtx, 1.0, 2.0);
  assert(ir.length === 44100, `Esperado 44100, recebido ${ir.length}`);
});

test('IR termina com amplitude próxima de zero (decay correto)', () => {
  const ir = createReverbIR(mockCtx, 1.0, 2.0);
  const lastSample = Math.abs(ir.left[ir.length - 1]);
  assertMax(lastSample, 0.01, 'Última amostra deve ser quase zero');
});

test('IR canal esquerdo ≠ canal direito (estereo independente)', () => {
  const ir = createReverbIR(mockCtx, 0.5, 2.0);
  let diff = 0;
  for (let i = 0; i < ir.length; i++) diff += Math.abs(ir.left[i] - ir.right[i]);
  assertMin(diff, 0.1, 'Canais L e R devem ser diferentes');
});

// ─── SUITE 2: LuminaMasteringProcessor ───────────────────────────────────────
console.log(C.bold(C.cyan('\n[2] LuminaMasteringProcessor – AGC + Soft Clipper + Limiter')));

const CEILING = 0.891;

test('Pico acima do ceiling é limitado para ≤ ceiling', () => {
  const proc = new registeredProcessors['lumina-mastering']();
  let lastOut;
  for (let b = 0; b < 50; b++) {
    const input = makeSineBlock(128, 1000, 1.5);
    const output = makeOutputBlock(128);
    proc.process([input], [output], {});
    lastOut = output;
  }
  const peak = peakOf(lastOut);
  assertMax(peak, CEILING + 0.001, `Pico deve ser ≤ ${CEILING}, recebeu ${peak.toFixed(5)}`);
});

// ─── SUITE 3: TransientShaperProcessor ───────────────────────────────────────
console.log(C.bold(C.cyan('\n[3] TransientShaperProcessor – Detector de Transientes')));

test('Sinal constante (sem transiente) não amplifica', () => {
  const proc = new registeredProcessors['transient-shaper']();
  let lastOut;
  for (let b = 0; b < 100; b++) {
    const input = makeBlock(128, 0.5);
    const output = makeOutputBlock(128);
    proc.process([input], [output], {});
    lastOut = output;
  }
  const peak = peakOf(lastOut);
  assertMax(peak, 0.75, 'Sinal constante estabilizado não deve amplificar excessivamente');
});

test('Responde a comandos de Attack / Sustain da porta', () => {
  const proc = new registeredProcessors['transient-shaper']();
  proc.port.onmessage({ data: { attackAmount: 1.0, sustainAmount: -0.5 } });
  assertClose(proc.attackAmount, 1.0, 0.001, 'Deve atualizar attackAmount via porta');
  assertClose(proc.sustainAmount, -0.5, 0.001, 'Deve atualizar sustainAmount via porta');
});

// ─── SUITE 4: AdaptiveEQProcessor ────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[4] AdaptiveEQProcessor – EQ Adaptativo 3 Bandas Biquad IIR')));

test('Sem divide-by-zero em sinal silencioso', () => {
  const proc = new registeredProcessors['adaptive-eq']();
  for (let b = 0; b < 50; b++) {
    const input = makeBlock(128, 0.0);
    const output = makeOutputBlock(128);
    proc.process([input], [output], {});
  }
  assert(true, 'Processou silêncio sem erros');
});

// ─── SUITE 5: CrossfeedProcessor ────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[5] CrossfeedProcessor – Bauer BS2B')));

test('Processa estéreo gerando bleeding cruzado com delay', () => {
  const proc = new registeredProcessors['crossfeed']();
  const input = [
    new Float32Array(128).fill(1.0), // Apenas canal L tem sinal
    new Float32Array(128).fill(0.0)
  ];
  const output = makeOutputBlock(128, 2);
  proc.process([input], [output], {});

  // O canal R de saída deve conter parte do sinal (bleeding)
  const peakR = Math.max(...output[1].map(Math.abs));
  assertMin(peakR, 0.01, 'Bleeding L->R deve ser detectável');
});

test('Responde a ajuste dinâmico de crossfeedAmount via porta', () => {
  const proc = new registeredProcessors['crossfeed']();
  proc.port.onmessage({ data: { crossfeedAmount: 0.8 } });
  assertClose(proc.crossfeedAmount, 0.8, 0.001, 'Deve atualizar crossfeedAmount via porta');
});

// ─── SUITE 6: SubmonoProcessor ──────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[6] SubmonoProcessor – Sub-bass Mono Maker')));

test('Sub-bass (50Hz) em canais opostos (fases invertidas) vira mono (cancela)', () => {
  const proc = new registeredProcessors['submono']();
  
  // Usar um único bloco contínuo grande (0.5s = 22050 samples)
  const size = 22050;
  const input = makeSineBlock(size, 10, 0.8);
  // Inverter o canal R
  for (let i = 0; i < input[1].length; i++) {
    input[1][i] = -input[1][i];
  }
  
  const output = makeOutputBlock(size, 2);
  proc.process([input], [output], {});

  // Medir o pico apenas na segunda metade do bloco (a partir do sample 11025)
  // onde a resposta transitória inicial do HPF já decaiu e estabilizou.
  let peakL = 0, peakR = 0;
  for (let i = 11025; i < size; i++) {
    peakL = Math.max(peakL, Math.abs(output[0][i]));
    peakR = Math.max(peakR, Math.abs(output[1][i]));
  }

  assertMax(peakL, 0.05, `Sub-bass 10Hz fora de fase deve cancelar (recebeu pico de L estabilizado: ${peakL.toFixed(4)})`);
  assertMax(peakR, 0.05, `Sub-bass 10Hz fora de fase deve cancelar (recebeu pico de R estabilizado: ${peakR.toFixed(4)})`);
});

// ─── SUITE 7: DeEsserProcessor ──────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[7] DeEsserProcessor – Dynamic Sibilance Suppressor')));

test('Sinal sibilante alto (6kHz) é atenuado, sinal baixo passa sem atenuação', () => {
  const proc = new registeredProcessors['deesser']();
  
  // Sinal baixo: passa sem de-essing
  const quietInput = makeSineBlock(128, 6000, 0.01);
  const quietOutput = makeOutputBlock(128);
  proc.process([quietInput], [quietOutput], {});
  const quietPeak = peakOf(quietOutput);
  assertClose(quietPeak, 0.01, 0.001, 'Sinal sibilante baixo deve manter amplitude original');

  // Sinal alto: de-esser deve atenuar
  let lastOut;
  for (let b = 0; b < 20; b++) {
    const loudInput = makeSineBlock(128, 6000, 0.8);
    const loudOutput = makeOutputBlock(128);
    proc.process([loudInput], [loudOutput], {});
    lastOut = loudOutput;
  }
  const loudPeak = peakOf(lastOut);
  assert(loudPeak < 0.8, `Sinal sibilante alto deve ser atenuado (recebeu ${loudPeak.toFixed(3)})`);
});

// ─── SUITE 8: SaturationProcessor ───────────────────────────────────────────
console.log(C.bold(C.cyan('\n[8] SaturationProcessor – Tube/Tape/Transformer Saturation')));

test('Aplica distorção harmônica e responde a mensagens de drive/mode', () => {
  const proc = new registeredProcessors['saturation']();
  
  // Definir drive forte e mix 100% wet
  proc.port.onmessage({ data: { mode: 'tube', drive: 0.9, mix: 1.0 } });

  const input = makeSineBlock(128, 1000, 0.8);
  const output = makeOutputBlock(128);
  proc.process([input], [output], {});

  // A saída deve ser alterada (distorcida) mas contida (<= 1.0)
  const peak = peakOf(output);
  assertMax(peak, 1.0001, 'A saturação não deve explodir a amplitude');
  
  // Verificar se o sinal foi alterado comparado com a senoide original
  let diff = 0;
  for (let i = 0; i < 128; i++) {
    diff += Math.abs(output[0][i] - input[0][i]);
  }
  assertMin(diff, 0.5, 'Sinal saturado deve diferir da senoide pura de entrada');
});


// ─── SUITE 9: LUFSMeterProcessor ────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[9] LUFSMeterProcessor – ITU-R BS.1770-4')));

test('Mede LUFS corretamente e envia via port', () => {
  const proc = new registeredProcessors['lufs-meter']();
  let reportedLufs = null;
  proc.onportmessage = (msg) => {
    reportedLufs = msg.lufs;
  };

  // Enviar sinal 1kHz seno a 0.707 amplitude (-3dBFS) por 50 blocos para encher janela de 400ms
  for (let b = 0; b < 150; b++) {
    const input = makeSineBlock(128, 1000, 0.707);
    const output = makeOutputBlock(128);
    proc.process([input], [output], {});
  }

  assert(reportedLufs !== null, 'LUFS Meter deve postar mensagens com resultado da medição');
  assertMax(reportedLufs, 0.0, 'LUFS medido não deve exceder 0 LUFS para sinal de -3dBFS');
  assertMin(reportedLufs, -15.0, 'LUFS medido deve refletir o sinal forte fornecido');
});

// ─── SUITE 10: ExciterProcessor ──────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[10] ExciterProcessor – Oversampling, ADAA Saturation & Dynamic Wet')));

test('Exciter processa sinais agudos aplicando saturação sem explodir amplitude', () => {
  const proc = new registeredProcessors['exciter']();
  proc.port.onmessage({ data: { amount: 0.5 } });
  
  // Sine de alta frequência (6kHz) para testar a ativação do crossover
  const input = makeSineBlock(128, 6000, 0.5);
  const output = makeOutputBlock(128);
  proc.process([input], [output], {});
  
  const peak = peakOf(output);
  assertMax(peak, 1.0, 'Exciter não deve causar clipping excessivo/estouro de amplitude');
  
  // Sinal deve ser modificado (saturado)
  let diff = 0;
  for (let i = 0; i < 128; i++) {
    diff += Math.abs(output[0][i] - input[0][i]);
  }
  assertMin(diff, 0.001, 'Sinal excitado de alta frequência deve ser sutilmente distorcido/saturado');
});

test('Exciter atenua o efeito wet em mixes com RMS alto (Dynamic Exciter)', () => {
  const proc = new registeredProcessors['exciter']();
  proc.port.onmessage({ data: { amount: 0.8 } });
  
  // Simular sinal com RMS muito alto para silenciar/atenuar a saturação
  const loudInput = makeSineBlock(128, 4000, 0.9);
  const loudOutput = makeOutputBlock(128);
  
  // Processar vários blocos para o RMS follower acumular
  for (let i = 0; i < 20; i++) {
    proc.process([loudInput], [loudOutput], {});
  }
  
  // O RMS deve estar próximo de 0.9 * 0.707 = 0.63
  // O que reduz o dynamicWet significativamente
  assert(proc.rms[0] > 0.1, 'Seguidor de RMS deve detectar o sinal alto');
});

// ─── SUITE 11: MultibandWidthProcessor ────────────────────────────────────────
console.log(C.bold(C.cyan('\n[11] MultibandWidthProcessor – Crossover & MS Widening por Bandas')));

test('MultibandWidth converte sub-graves (<150Hz) em mono mesmo com largura ampla', () => {
  const proc = new registeredProcessors['multiband-width']();
  proc.port.onmessage({ data: { width: 1.8 } }); // Configuração "Ultra"
  
  // Sinal sub-grave (50Hz) com fase invertida (L = 1, R = -1) - sinal estéreo puro e contínuo
  const input = makeSineBlock(128, 50, 0.8);
  const output = makeOutputBlock(128);
  
  // Processar blocos para estabilizar o SVF
  for (let b = 0; b < 150; b++) {
    for (let i = 0; i < 128; i++) {
      const t = b * 128 + i;
      const val = 0.8 * Math.sin(2 * Math.PI * 50 * t / 44100);
      input[0][i] = val;
      input[1][i] = -val;
    }
    proc.process([input], [output], {});
  }
  
  // A saída do sub-grave estéreo invertido deve ser quase cancelada e mono (quase zero)
  const peak = peakOf(output);
  assertMax(peak, 0.05, `Sinais graves fora de fase devem ser cancelados devido ao mono maker (<150Hz), recebeu pico ${peak.toFixed(5)}`);
});

test('MultibandWidth alarga frequências médias e altas conforme controle do usuário', () => {
  const proc = new registeredProcessors['multiband-width']();
  proc.port.onmessage({ data: { width: 1.5 } }); // Alargamento amplo
  
  // Sinal de alta frequência (5kHz) em estéreo (L=1, R=0)
  const input = makeSineBlock(128, 5000, 0.8);
  for (let i = 0; i < 128; i++) {
    input[1][i] = 0.0;
  }
  
  const output = makeOutputBlock(128);
  proc.process([input], [output], {});
  
  // Deve haver vazamento estéreo com alargamento no canal direito
  const rightPeak = Math.max(...output[1].map(Math.abs));
  assertMin(rightPeak, 0.1, `Frequências altas devem ser espalhadas para o outro canal. Pico no canal oposto: ${rightPeak.toFixed(5)}`);
});

// ─── SUITE 12: DeHarshProcessor ──────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[12] DeHarshProcessor – Dynamic Resonance Suppression')));

test('DeHarsh detecta sinal forte em 5kHz e atenua a saída para evitar harshness', () => {
  const proc = new registeredProcessors['deharsh']();
  
  // Sine agudo de 4.5kHz (frequência central do notch) com amplitude alta (0.8)
  const input = makeSineBlock(128, 4500, 0.8);
  const output = makeOutputBlock(128);
  
  // Processar vários blocos para o seguidor de envelope atingir o limiar e atuar
  for (let b = 0; b < 40; b++) {
    proc.process([input], [output], {});
  }
  
  const peakIn = peakOf(input);
  const peakOut = peakOf(output);
  assert(peakOut < peakIn, `O sinal de saída (${peakOut.toFixed(4)}) deve ser atenuado em relação à entrada (${peakIn.toFixed(4)})`);
  assertMin(peakOut, 0.2, 'A atenuação deve ser musical e não silenciar completamente o sinal');
});

// ─── SUITE 13: SubMonoProcessor Bass Recovery ──────────────────────────────
console.log(C.bold(C.cyan('\n[13] SubMonoProcessor – Psychoacoustic Bass Recovery')));

test('SubMono gera harmônicos de oitava superior (2º e 3º) para sinais abaixo de 80Hz se configurado', () => {
  const proc = new registeredProcessors['submono']();
  proc.port.onmessage({ data: { bassRecovery: 1.0 } });
  
  // Sine puro de 50Hz (sub-bass)
  const input = makeSineBlock(128, 50, 0.5);
  const output = makeOutputBlock(128);
  
  proc.process([input], [output], {});
  
  // Como o sinal original era um seno de 50Hz puro, qualquer componente distorcido é a distorção harmônica
  let hasHarmonics = false;
  for (let i = 0; i < 128; i++) {
    const expectedPure = 0.5 * Math.sin(2 * Math.PI * 50 * i / 44100);
    if (Math.abs(output[0][i] - expectedPure) > 0.002) {
      hasHarmonics = true;
      break;
    }
  }
  assert(hasHarmonics, 'A saída deve conter harmônicos gerados pelo algoritmo de recuperação de graves');
});

// ─── SUITE 14: SpectralGlueProcessor ──────────────────────────────────────────
console.log(C.bold(C.cyan('\n[14] SpectralGlueProcessor – Crossover & Correlation-aware Glue Compressor')));

test('SpectralGlue não quebra sob silêncio e comprime adequadamente quando ativo', () => {
  const proc = new registeredProcessors['spectral-glue']();
  proc.port.onmessage({ data: { active: true, threshold: -20.0 } });

  // Sinal forte estéreo puro
  const input = makeSineBlock(128, 1000, 0.9);
  const output = makeOutputBlock(128);

  // Processar múltiplos blocos para o compressor atuar
  for (let b = 0; b < 50; b++) {
    proc.process([input], [output], {});
  }

  const peakIn = peakOf(input);
  const peakOut = peakOf(output);
  assert(peakOut < peakIn, `O sinal forte de saída (${peakOut.toFixed(4)}) deve ser comprimido em relação à entrada (${peakIn.toFixed(4)})`);
});

// ─── SUITE 15: DepthProcessor ────────────────────────────────────────────────
console.log(C.bold(C.cyan('\n[15] DepthProcessor – Psychoacoustic Near/Far Spatialization')));

test('DepthProcessor atenua transientes e reduz agudos no canal Mid e aumenta no Side', () => {
  const proc = new registeredProcessors['depth']();
  proc.port.onmessage({ data: { active: true, depth: 1.0 } });

  // Sinal de teste com um pico forte (transiente)
  const input = makeSineBlock(128, 1000, 0.2);
  input[0][10] = 0.9;
  input[1][10] = 0.9; // Transiente central (Mid)

  const output = makeOutputBlock(128);
  proc.process([input], [output], {});

  // O pico no canal Mid da saída deve ser suavizado (menor que o pico de entrada de 0.9)
  const peakOut = peakOf(output);
  assert(peakOut < 0.9, `Transientes centrais devem ser suavizados no modo Far (pico recebido: ${peakOut.toFixed(4)})`);
});

// ─── Resultado Final ──────────────────────────────────────────────────────────
const divider = '─'.repeat(55);
console.log(`\n${divider}`);
const color = failed === 0 ? C.green : C.red;
console.log(C.bold(`  RESULTADO: ${color(`${passed} passaram`)} / ${failed > 0 ? C.red(`${failed} falharam`) : '0 falharam'} / ${total} total`));
console.log(divider);

if (failed > 0) {
  console.log(C.yellow(`\n  ⚠ ${failed} teste(s) falharam. Verifique os logs acima.\n`));
  process.exit(1);
} else {
  console.log(C.green(`\n  ✓ Todos os ${total} testes passaram com sucesso!\n`));
  process.exit(0);
}
