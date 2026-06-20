/**
 * Lumina De-esser Processor v2.0
 * Detects and suppresses harsh sibilance (4-8kHz) dynamically.
 * Combines L/R channels for detection to ensure full stereo coverage.
 */
class DeEsserProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
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

    // Classic Logarithmic Compressor Parameters
    this.threshold = 0.032;
    this.ratio = 2.5;
    this.maxGR = Math.pow(10, -6.0 / 20); // Limite hard em -6.0dB (0.501)

    // Runtime-adjustable via port
    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) this.active = !!e.data.active;
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
    if (!this.active) {
      if (inputs[0] && inputs[0][0] && outputs[0] && outputs[0][0]) {
        outputs[0][0].set(inputs[0][0]);
        if (inputs[0][1] && outputs[0][1]) outputs[0][1].set(inputs[0][1]);
      }
      return true;
    }
    const input = inputs[0], output = outputs[0];
    if (!input || !input[0]) return true;

    let sumIn = 0, sumBand = 0;
    let minGain = 1.0;

    for (let i = 0; i < input[0].length; i++) {
      // Stereo-aware: combine Left and Right channels for detection
      const sampleL = input[0][i];
      const sampleR = input[1] ? input[1][i] : sampleL;
      const monoSample = (sampleL + sampleR) * 0.5;

      sumIn += monoSample * monoSample;
      const detVal = this._bq(monoSample, this.bpf, this.detZ);
      sumBand += detVal * detVal;
      
      const det = Math.abs(detVal);
      this.env = det > this.env
        ? this.aAtk * this.env + (1 - this.aAtk) * det
        : this.aRel * this.env + (1 - this.aRel) * det;

      // Classic Compressor Gain computation (Logarithmic Domain)
      let gain = 1.0;
      if (this.env > this.threshold) {
        const envDb = 20 * Math.log10(this.env + 1e-12);
        const threshDb = 20 * Math.log10(this.threshold + 1e-12);
        
        // excessDb é o quanto passou do Threshold
        const excessDb = envDb - threshDb;
        
        // gainReductionDb = -excess * (1 - 1/Ratio)
        const gainReductionDb = -excessDb * (1.0 - 1.0 / this.ratio);
        
        const grLinear = Math.pow(10, gainReductionDb / 20);
        gain = Math.max(this.maxGR, grLinear); // Clamp em -6dB
      }

      for (let ch = 0; ch < input.length; ch++) {
        if (output[ch]) output[ch][i] = input[ch][i] * gain;
      }
      if (gain < minGain) minGain = gain;
    }

    if (this.active) {
      this._dbgIn = (this._dbgIn || 0) + sumIn;
      this._dbgBand = (this._dbgBand || 0) + sumBand;
      this._dbgMinGain = Math.min(this._dbgMinGain || 1.0, minGain);
      this._telemetryCount = (this._telemetryCount || 0) + 1;
      
      if (this._telemetryCount >= 60) {
        const samples = 60 * input[0].length;
        const inRMS = Math.sqrt(this._dbgIn / samples);
        const bandRMS = Math.sqrt(this._dbgBand / samples);
        const gainReductionDb = 20 * Math.log10(this._dbgMinGain + 1e-12);
        
        this.port.postMessage({
          type: 'telemetry',
          name: 'DeEsser',
          inRMS: inRMS.toFixed(3),
          bandRMS: bandRMS.toFixed(3),
          gainReduction: gainReductionDb.toFixed(1) + 'dB',
          threshold: this.threshold.toFixed(3),
          triggered: this._dbgMinGain < 0.99
        });
        
        this._dbgIn = 0;
        this._dbgBand = 0;
        this._dbgMinGain = 1.0;
        this._telemetryCount = 0;
      }
    }

    return true;
  }
}
registerProcessor('deesser', DeEsserProcessor);
