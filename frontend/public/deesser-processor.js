/**
 * Lumina De-esser Processor v2.0
 * Detects and suppresses harsh sibilance (4-8kHz) dynamically.
 * Combines L/R channels for detection to ensure full stereo coverage.
 */
class DeEsserProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;

    // Detection BPF centered at 6kHz, Q=2.5
    const fc = 6000, Q = 2.5;
    const w0 = 2 * Math.PI * fc / sr;
    const cosW0 = Math.cos(w0), sinW0 = Math.sin(w0);
    const alpha = sinW0 / (2 * Q);
    const a0 = 1 + alpha;
    this.bpf = {
      b0: alpha / a0, b1: 0, b2: -alpha / a0,
      a1: -2 * cosW0 / a0, a2: (1 - alpha) / a0,
    };
    this.detZ = [0, 0];

    // Envelope follower
    const atkMs = 2.0, relMs = 60.0;
    this.aAtk = Math.exp(-1 / (sr * atkMs  / 1000));
    this.aRel = Math.exp(-1 / (sr * relMs / 1000));
    this.env  = 0;

    // Threshold linear (~-22dBFS in the sibilance band) and max GR (-6dB)
    this.threshold = 0.08;
    this.maxGR     = Math.pow(10, -6 / 20); // 0.501

    // Runtime-adjustable via port
    this.port.onmessage = (e) => {
      if (e.data.threshold !== undefined) this.threshold = e.data.threshold;
    };
  }

  _bq(x, c, z) {
    const y = c.b0 * x + z[0];
    z[0] = c.b1 * x - c.a1 * y + z[1];
    z[1] = c.b2 * x - c.a2 * y;
    return y;
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input || !input[0]) return true;

    for (let i = 0; i < input[0].length; i++) {
      // Stereo-aware: combine Left and Right channels for detection
      const sampleL = input[0][i];
      const sampleR = input[1] ? input[1][i] : sampleL;
      const monoSample = (sampleL + sampleR) * 0.5;

      const det = Math.abs(this._bq(monoSample, this.bpf, this.detZ));
      this.env = det > this.env
        ? this.aAtk * this.env + (1 - this.aAtk) * det
        : this.aRel * this.env + (1 - this.aRel) * det;

      // Gain computation (soft knee)
      let gain = 1.0;
      if (this.env > this.threshold) {
        const excess = this.env / this.threshold;
        const gr = 1.0 - (1.0 - this.maxGR) * Math.min(1.0, excess - 1.0);
        gain = Math.max(this.maxGR, gr);
      }

      for (let ch = 0; ch < input.length; ch++) {
        if (output[ch]) output[ch][i] = input[ch][i] * gain;
      }
    }
    return true;
  }
}
registerProcessor('deesser', DeEsserProcessor);
