/**
 * Lumina Audio Engine – Teste Sintético da Matemática de DSP Avançado
 * 
 * Este arquivo testa a integridade matemática do Dither de ruído anti-denormal,
 * a fórmula da curva de waveshaper do Exciter Harmônico e a seletividade de frequência do
 * passa-altas de 2.5kHz.
 * 
 * Rodar: node scratch/verify_advanced_dsp.js
 */

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

function assertClose(a, b, tol = 0.0001) {
  if (Math.abs(a - b) > tol) {
    throw new Error(`Esperado ${a} próximo de ${b} (tolerância ${tol})`);
  }
}

// --- Funções importadas/simuladas do PlayerBar.jsx ---

const makeExciterCurve = (amount) => {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    if (amount === 0) {
      curve[i] = x;
    } else {
      curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
  }
  return curve;
};

// Simulador de Filtro Biquad Passa-Altas de 1 Polo / 2 Polos simples
class SimpleHighpassFilter {
  constructor(cutoff, sampleRate) {
    // Coeficientes básicos de passa-altas de 1º ordem
    const w0 = (2 * Math.PI * cutoff) / sampleRate;
    this.alpha = Math.sin(w0) / 2;
    this.cosw0 = Math.cos(w0);
    // Coeficientes do filtro
    this.b0 = (1 + this.cosw0) / 2;
    this.b1 = -(1 + this.cosw0);
    this.b2 = (1 + this.cosw0) / 2;
    this.a0 = 1 + this.alpha;
    this.a1 = -2 * this.cosw0;
    this.a2 = 1 - this.alpha;
    
    // Estados
    this.x1 = 0; this.x2 = 0;
    this.y1 = 0; this.y2 = 0;
  }

  process(sample) {
    const out = (this.b0 / this.a0) * sample +
                (this.b1 / this.a0) * this.x1 +
                (this.b2 / this.a0) * this.x2 -
                (this.a1 / this.a0) * this.y1 -
                (this.a2 / this.a0) * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = out;
    return out;
  }
}

// ─── SUITE 1: Dither contra Denormais ────────────────────────────────────────
console.log(C.bold(C.cyan('\n[1] Testes do Dither de Ruído Anti-Denormal')));

test('Dither gera amplitude controlada na casa de 1e-10', () => {
  const sampleRate = 44100;
  const ditherBuffer = new Float32Array(sampleRate);
  for (let i = 0; i < ditherBuffer.length; i++) {
    ditherBuffer[i] = (Math.random() * 2 - 1) * 1e-10;
  }

  let maxVal = 0;
  let rmsSum = 0;
  for (let i = 0; i < ditherBuffer.length; i++) {
    const val = Math.abs(ditherBuffer[i]);
    if (val > maxVal) maxVal = val;
    rmsSum += val * val;
  }
  const rms = Math.sqrt(rmsSum / ditherBuffer.length);

  assert(maxVal <= 1e-10, `Amplitude máxima não pode exceder 1e-10. Recebido: ${maxVal}`);
  assert(rms > 0, 'RMS do dither deve ser maior que zero (ruído não-silencioso)');
  assert(rms < 1e-10, `RMS deve ser menor que a amplitude máxima. Recebido: ${rms}`);
});

// ─── SUITE 2: Curva do Waveshaper do Exciter Harmônico ──────────────────────
console.log(C.bold(C.cyan('\n[2] Testes da Curva de Saturação (Waveshaper) do Exciter')));

test('Curva com amount = 0 é totalmente linear', () => {
  const curve = makeExciterCurve(0);
  assert(curve.length === 256, 'Comprimento da curva deve ser 256');
  // Amostra central deve ser aproximadamente zero
  assertClose(curve[128], 0.0, 0.01);
  // Extremo negativo deve ser -1
  assertClose(curve[0], -1.0, 0.01);
  // Extremo positivo deve ser 1
  assertClose(curve[255], 1.0, 0.01);
  // Relação estritamente linear
  assertClose(curve[64], -0.5, 0.01);
});

test('Curva com amount > 0 é simétrica e não ultrapassa amplitude de 1.0', () => {
  const amounts = [0.5, 1.5, 3.0];
  for (let amt of amounts) {
    const curve = makeExciterCurve(amt);
    assert(curve.length === 256, 'Comprimento deve ser 256');
    assertClose(curve[128], 0.0, 0.01); // Amostra central em 0
    assert(Math.abs(curve[0]) <= 1.0, `Curva não deve explodir o pico negativo (${curve[0]})`);
    assert(Math.abs(curve[255]) <= 1.0, `Curva não deve explodir o pico positivo (${curve[255]})`);
    
    // Teste de simetria (f(x) === -f(-x))
    for (let i = 0; i < 128; i++) {
      assertClose(curve[i], -curve[255 - i], 0.0001);
    }
  }
});

// ─── SUITE 3: Testes do Filtro Passa-Altas do Exciter ───────────────────────
console.log(C.bold(C.cyan('\n[3] Testes da Seletividade de Frequência do Exciter')));

test('Sinal abaixo de 2.5kHz (ex: 100Hz) é significativamente atenuado', () => {
  const filter = new SimpleHighpassFilter(2500, 44100);
  const freq = 100;
  const amp = 1.0;
  
  // Alimentar o filtro por 500 amostras (estabilização)
  let lastOut = 0;
  for (let i = 0; i < 500; i++) {
    const sample = amp * Math.sin(2 * Math.PI * freq * i / 44100);
    lastOut = filter.process(sample);
  }

  // Com atenuação de passa-altas de 2.5kHz em sinal de 100Hz, a atenuação deve ser > 20dB
  assert(Math.abs(lastOut) < 0.05, `Sinal de 100Hz deveria estar atenuado. Pico recebido: ${Math.abs(lastOut).toFixed(4)}`);
});

test('Sinal acima de 2.5kHz (ex: 5000Hz) passa com pouca atenuação', () => {
  const filter = new SimpleHighpassFilter(2500, 44100);
  const freq = 5000;
  const amp = 1.0;
  
  let maxOut = 0;
  for (let i = 0; i < 500; i++) {
    const sample = amp * Math.sin(2 * Math.PI * freq * i / 44100);
    const out = Math.abs(filter.process(sample));
    if (out > maxOut) maxOut = out;
  }

  // Sinais bem acima do corte devem passar com pouca perda (> 0.5)
  assert(maxOut > 0.6, `Sinal de 5000Hz deveria passar. Pico recebido: ${maxOut.toFixed(4)}`);
});

// ─── SUITE 4: Teste de Sobrecarga e Estabilidade Geral ──────────────────────
console.log(C.bold(C.cyan('\n[4] Teste de Sobrecarga do Exciter Harmônico')));

test('Parallel Exciter processando sinal saturado não causa clipping digital acima de +0dBFS', () => {
  // Simula a cadeia paralela: Dry + Wet (HPF -> Shaper -> WetGain)
  // Onde WetGain = 0.5 e Shaper curve satura a sinal
  const filter = new SimpleHighpassFilter(2500, 44100);
  const curve = makeExciterCurve(1.5); // Médio
  
  const wetGain = 0.5;
  const inputFreq = 3000;
  let maxOutputPeak = 0;

  for (let i = 0; i < 1000; i++) {
    const dry = Math.sin(2 * Math.PI * inputFreq * i / 44100) * 0.9; // 0.9 amplitude (alto)
    
    // Processamento da cadeia Wet
    const filtered = filter.process(dry);
    
    // WaveShaper Lookup simples (mapeamento linear de [-1, 1] para a tabela de 256 pontos)
    const normalizedIndex = Math.min(Math.max((filtered + 1) / 2 * 255, 0), 255);
    const lowIdx = Math.floor(normalizedIndex);
    const highIdx = Math.ceil(normalizedIndex);
    const frac = normalizedIndex - lowIdx;
    const saturated = curve[lowIdx] * (1 - frac) + curve[highIdx] * frac;

    const wet = saturated * wetGain;
    const output = dry + wet;

    if (Math.abs(output) > maxOutputPeak) {
      maxOutputPeak = Math.abs(output);
    }
  }

  console.log(`    Pico Máximo de Saída da Soma Paralela: ${maxOutputPeak.toFixed(4)}`);
  // Deve estar dentro de limites seguros (limiter cuidará do excesso, mas não deve explodir a valores insanos)
  assert(maxOutputPeak < 2.0, `Pico de saída instável ou explodindo: ${maxOutputPeak}`);
});

// ─── Resultado Final ──────────────────────────────────────────────────────────
const divider = '─'.repeat(55);
console.log(`\n${divider}`);
const color = failed === 0 ? C.green : C.red;
console.log(C.bold(`  RESULTADO: ${color(`${passed} passaram`)} / ${failed > 0 ? C.red(`${failed} falharam`) : '0 falharam'} / ${total} total`));
console.log(divider);

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
