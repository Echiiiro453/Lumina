/**
 * Lumina Adaptive EQ Processor v3.0
 * 
 * Melodias e Crossover Baseados em SVF TPT (State Variable Filter - Topology Preserving Transform)
 * para maior estabilidade analógica e imunidade a artefatos transientes.
 * 
 * Otimização: Downsampling de cálculo de ganho e Math.sqrt para a cada 32 amostras
 * para cortar substancialmente o uso de CPU.
 */
class AdaptiveEQProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.port.onmessage = (e) => { if (e.data.active !== undefined) this.active = !!e.data.active; };

    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;

    // SVF coefficients for Lowpass (300Hz, Q=0.707)
    this.gLP = Math.tan(Math.PI * 300 / sr);
    this.kLP = 1.0 / 0.707;
    this.D_LP = 1.0 + this.gLP * (this.gLP + this.kLP);

    // SVF coefficients for Highpass (3000Hz, Q=0.707)
    this.gHP = Math.tan(Math.PI * 3000 / sr);
    this.kHP = 1.0 / 0.707;
    this.D_HP = 1.0 + this.gHP * (this.gHP + this.kHP);

    // Estado dos filtros: [s1, s2] per channel
    const MAX_CH = 8;
    this.lpfState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.hpfState = Array.from({ length: MAX_CH }, () => new Float32Array(2));

    // Energia por banda (RMS²) para cada canal
    this.energyLow  = new Float32Array(MAX_CH);
    this.energyMid  = new Float32Array(MAX_CH);
    this.energyHigh = new Float32Array(MAX_CH);

    // Integração lenta de energia (≈ 200ms a 44.1kHz)
    this.energyAlpha = Math.exp(-1.0 / (sr * 0.200));

    // Proporção alvo: ruído rosa (Low ≈ 1.5× Mid, High ≈ 0.5× Mid)
    this.targetLowRatio  = 1.5;
    this.targetHighRatio = 0.5;

    // Ganhos suavizados com TC de ~50ms
    this.gainLow  = new Float32Array(MAX_CH).fill(1);
    this.gainHigh = new Float32Array(MAX_CH).fill(1);
    this.gainAlpha = Math.exp(-1.0 / (sr * 0.050));

    // Cache para os ganhos alvo calculados a cada 32 amostras
    this.targetL = new Float32Array(MAX_CH).fill(1.0);
    this.targetH = new Float32Array(MAX_CH).fill(1.0);
  }

  // --- SVF TPT processing nodes ---
  _svfLP(sample, state, g, k, D) {
    const vhp = (sample - (g + k) * state[0] - state[1]) / D;
    const vbp = g * vhp + state[0];
    const vlp = g * vbp + state[1];

    state[0] = 2 * vbp - state[0];
    state[1] = 2 * vlp - state[1];

    return vlp;
  }

  _svfHP(sample, state, g, k, D) {
    const vhp = (sample - (g + k) * state[0] - state[1]) / D;
    const vbp = g * vhp + state[0];
    const vlp = g * vbp + state[1];

    state[0] = 2 * vbp - state[0];
    state[1] = 2 * vlp - state[1];

    return vhp;
  }

  process(inputs, outputs) {
    if (!this.active) {
      if (inputs[0] && inputs[0][0] && outputs[0] && outputs[0][0]) {
        outputs[0][0].set(inputs[0][0]);
        if (inputs[0][1] && outputs[0][1]) outputs[0][1].set(inputs[0][1]);
      }
      return true;
    }
    const input  = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    const eAlpha    = this.energyAlpha;
    const gAlpha    = this.gainAlpha;
    const MIN_CLAMP = 0.5;
    const MAX_CLAMP = 2.0;

    for (let c = 0; c < input.length; c++) {
      const inCh  = input[c];
      const outCh = output[c];
      const lpState = this.lpfState[c];
      const hpState = this.hpfState[c];

      for (let i = 0; i < inCh.length; i++) {
        const sample = inCh[i];

        // ── Crossover SVF TPT (12dB/oct) ──
        const low  = this._svfLP(sample, lpState, this.gLP, this.kLP, this.D_LP);
        const high = this._svfHP(sample, hpState, this.gHP, this.kHP, this.D_HP);
        const mid  = sample - low - high;

        // ── Tracker de energia RMS² por banda ──
        this.energyLow[c]  = eAlpha * this.energyLow[c]  + (1 - eAlpha) * (low  * low);
        this.energyMid[c]  = eAlpha * this.energyMid[c]  + (1 - eAlpha) * (mid  * mid);
        this.energyHigh[c] = eAlpha * this.energyHigh[c] + (1 - eAlpha) * (high * high);

        // Otimização matemática: calcula raízes e divisões apenas a cada 32 amostras
        if (i % 32 === 0) {
          const eMid  = Math.max(1e-10, this.energyMid[c]);
          const eLow  = Math.max(1e-10, this.energyLow[c]);
          const eHigh = Math.max(1e-10, this.energyHigh[c]);

          let tLow  = Math.sqrt((eMid * this.targetLowRatio)  / eLow);
          let tHigh = Math.sqrt((eMid * this.targetHighRatio) / eHigh);

          this.targetL[c] = Math.max(MIN_CLAMP, Math.min(MAX_CLAMP, tLow));
          this.targetH[c] = Math.max(MIN_CLAMP, Math.min(MAX_CLAMP, tHigh));
        }

        // ── Suavizar ganhos (TC 50ms) usando interpolação exponencial leve a cada amostra ──
        this.gainLow[c]  = gAlpha * this.gainLow[c]  + (1 - gAlpha) * this.targetL[c];
        this.gainHigh[c] = gAlpha * this.gainHigh[c] + (1 - gAlpha) * this.targetH[c];

        outCh[i] = (low * this.gainLow[c]) + mid + (high * this.gainHigh[c]);
      }
    }

    return true;
  }
}

registerProcessor('adaptive-eq', AdaptiveEQProcessor);

