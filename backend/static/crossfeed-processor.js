/**
 * Lumina Crossfeed Processor v3.0
 * 
 * Implementação do algoritmo Bauer Stereophonic-to-Binaural (BS2B) com
 * atraso temporal ITD fracionário exato de 0.2ms (8.82 amostras @ 44.1kHz)
 * usando Interpolação de Lagrange de 3ª ordem para fidelidade acústica analógica.
 */
class CrossfeedProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.telemetryEnabled = true;

    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;

    // ── Coeficientes do LPF para Bleed (corte em ~700Hz) ──
    const fcBleed = 700;
    const Q       = 0.5; // Coeficiente mais suave para o crossover de fones
    const w0      = 2 * Math.PI * fcBleed / sr;
    const cosW0   = Math.cos(w0);
    const alpha   = Math.sin(w0) / (2 * Q);
    const a0      = 1 + alpha;

    this.lpf = {
      b0: ((1 - cosW0) / 2) / a0,
      b1: (1 - cosW0) / a0,
      b2: ((1 - cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0,
      a2: (1 - alpha) / a0,
    };

    // ── Coeficientes do High-shelf Direct Compensation (corte em ~700Hz, +2.5dB boost) ──
    const fcDirect = 700;
    const gainDb   = 2.5; 
    const A        = Math.pow(10, gainDb / 40);
    const w0D      = 2 * Math.PI * fcDirect / sr;
    const sinW0D   = Math.sin(w0D);
    const beta     = Math.sqrt(A) / Q;
    const alphaD   = sinW0D / 2 * beta;
    const cosW0D   = Math.cos(w0D);
    const a0D      = (A + 1) - (A - 1) * cosW0D + 2 * Math.sqrt(A) * alphaD;

    this.hs = {
      b0: (A * ((A + 1) + (A - 1) * cosW0D + 2 * Math.sqrt(A) * alphaD)) / a0D,
      b1: (-2 * A * ((A - 1) + (A + 1) * cosW0D)) / a0D,
      b2: (A * ((A + 1) + (A - 1) * cosW0D - 2 * Math.sqrt(A) * alphaD)) / a0D,
      a1: (2 * ((A - 1) - (A + 1) * cosW0D)) / a0D,
      a2: ((A + 1) - (A - 1) * cosW0D - 2 * Math.sqrt(A) * alphaD) / a0D,
    };

    // Estados dos filtros
    this.zL_lpf = [0, 0]; this.zR_lpf = [0, 0];
    this.zL_hs  = [0, 0]; this.zR_hs  = [0, 0];

    // ITD Delay Buffer (0.2ms a 44.1kHz ≈ 8.82 amostras)
    this.itdSamples = sr * 0.0002;
    this.delayBufLen = 16;
    this.delayBufL = new Float32Array(this.delayBufLen);
    this.delayBufR = new Float32Array(this.delayBufLen);
    this.delayIdx  = 0;

    // Fator de ganho de crosstalk ajustável em runtime via port
    this.crossfeedAmount = 0.25; // Nível padrão (0.0 a 1.0)
    
    this.port.onmessage = (e) => {
      if (e.data?.type === 'setTelemetryEnabled') { this.telemetryEnabled = !!e.data.enabled; return; }
      if (e.data.crossfeedAmount !== undefined) {
        this.crossfeedAmount = Math.max(0, Math.min(e.data.crossfeedAmount, 1.0));
      }
    };
  }

  _biquad(sample, c, z) {
    const out = c.b0 * sample + z[0];
    z[0] = c.b1 * sample - c.a1 * out + z[1];
    z[1] = c.b2 * sample - c.a2 * out;
    return out;
  }

  // Interpolação de Lagrange de 3ª ordem para leitura fracionária do buffer circular
  readLagrange(buffer, writeIdx, delaySamples) {
    const len = buffer.length;
    const intDelay = Math.floor(delaySamples);
    const frac = delaySamples - intDelay;
    
    const floorIdx = (writeIdx - intDelay + len) % len;
    
    const idx0 = (floorIdx + 1) % len;
    const idx1 = floorIdx;
    const idx2 = (floorIdx - 1 + len) % len;
    const idx3 = (floorIdx - 2 + len) % len;
    
    const x0 = buffer[idx0];
    const x1 = buffer[idx1];
    const x2 = buffer[idx2];
    const x3 = buffer[idx3];
    
    const c0 = -frac * (frac - 1) * (frac - 2) / 6.0;
    const c1 = (frac + 1) * (frac - 1) * (frac - 2) / 2.0;
    const c2 = -(frac + 1) * frac * (frac - 2) / 2.0;
    const c3 = (frac + 1) * frac * (frac - 1) / 6.0;
    
    return c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
  }

  process(inputs, outputs) {
    const input  = inputs[0];
    const output = outputs[0];

    if (!input || input.length < 2) {
      if (input && input[0] && output && output[0]) output[0].set(input[0]);
      return true;
    }

    const inL  = input[0];
    const inR  = input[1];
    const outL = output[0];
    const outR = output[1];

    const bleedGain = this.crossfeedAmount * 0.25; 

    for (let i = 0; i < inL.length; i++) {
      const L = inL[i];
      const R = inR[i];

      // 1. Aplicar compensação High-shelf no sinal direto para preservar o brilho
      const directL = this._biquad(L, this.hs, this.zL_hs);
      const directR = this._biquad(R, this.hs, this.zR_hs);

      // 2. Extrair o bleed de cruzamento do canal L e R usando o LPF
      const bleedL = this._biquad(L, this.lpf, this.zL_lpf) * bleedGain;
      const bleedR = this._biquad(R, this.lpf, this.zR_lpf) * bleedGain;

      // 3. Aplicar atraso temporal ITD fracionário via Lagrange
      const delayedL = this.readLagrange(this.delayBufL, this.delayIdx, this.itdSamples);
      const delayedR = this.readLagrange(this.delayBufR, this.delayIdx, this.itdSamples);

      this.delayBufL[this.delayIdx] = bleedL;
      this.delayBufR[this.delayIdx] = bleedR;
      
      this.delayIdx = (this.delayIdx + 1) % this.delayBufLen;

      // 4. L recebe sinal direto de L + bleed atrasado de R; R recebe sinal direto de R + bleed atrasado de L
      outL[i] = directL + delayedR;
      outR[i] = directR + delayedL;
    }

    return true;
  }
}

registerProcessor('crossfeed', CrossfeedProcessor);

