/**
 * Lumina LUFS Meter Processor v1.0
 * ITU-R BS.1770-4 K-weighted loudness measurement.
 * Passthrough node: audio passes unchanged, reports LUFS to main thread.
 */
class LUFSMeterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;

    // Stage 1: High-shelf pre-filter (K-weighting)
    const f0 = 1681.97, G = 3.99984, Q1 = 0.7071;
    const K1 = Math.tan(Math.PI * f0 / sr);
    const Vh = Math.pow(10, G / 20);
    const Vb = Math.pow(Vh, 0.4996667741545416);
    const a0s1 = 1 + K1 / Q1 + K1 * K1;
    this.s1 = {
      b0: (Vh + Vb * K1 / Q1 + K1 * K1) / a0s1,
      b1: 2 * (K1 * K1 - Vh) / a0s1,
      b2: (Vh - Vb * K1 / Q1 + K1 * K1) / a0s1,
      a1: 2 * (K1 * K1 - 1) / a0s1,
      a2: (1 - K1 / Q1 + K1 * K1) / a0s1,
    };

    // Stage 2: High-pass RLB weighting
    const f1 = 38.13, Q2 = 0.5003270373238773;
    const K2 = Math.tan(Math.PI * f1 / sr);
    const a0s2 = 1 + K2 / Q2 + K2 * K2;
    this.s2 = {
      b0: 1 / a0s2, b1: -2 / a0s2, b2: 1 / a0s2,
      a1: 2 * (K2 * K2 - 1) / a0s2,
      a2: (1 - K2 / Q2 + K2 * K2) / a0s2,
    };

    // Filter states per channel
    this.s1z = Array.from({length: 8}, () => [0, 0]);
    this.s2z = Array.from({length: 8}, () => [0, 0]);

    // 400ms sliding window buffer for momentary LUFS
    const winLen = Math.round(sr * 0.4);
    this.buf = new Float32Array(winLen);
    this.bufIdx = 0; this.bufFull = false; this.sumSq = 0;

    // Report every 100ms
    this.reportStep = Math.round(sr * 0.1);
    this.reportCnt  = 0;
  }

  _bq(x, c, z) {
    const y = c.b0 * x + z[0];
    z[0] = c.b1 * x - c.a1 * y + z[1];
    z[1] = c.b2 * x - c.a2 * y;
    return y;
  }

  process(inputs, outputs) {
    const input = inputs[0]; const output = outputs[0];
    if (!input || !input[0]) return true;

    // Passthrough
    for (let ch = 0; ch < input.length; ch++) {
      if (output[ch]) output[ch].set(input[ch]);
    }

    const L = input[0], R = input[1] || input[0];

    for (let i = 0; i < L.length; i++) {
      const kL = this._bq(this._bq(L[i], this.s1, this.s1z[0]), this.s2, this.s2z[0]);
      const kR = this._bq(this._bq(R[i], this.s1, this.s1z[1]), this.s2, this.s2z[1]);
      const ms = (kL * kL + kR * kR) * 0.5;

      this.sumSq -= this.buf[this.bufIdx];
      this.buf[this.bufIdx] = ms;
      this.sumSq += ms;
      this.bufIdx = (this.bufIdx + 1) % this.buf.length;
      if (this.bufIdx === 0) this.bufFull = true;

      if (++this.reportCnt >= this.reportStep) {
        this.reportCnt = 0;
        const count = this.bufFull ? this.buf.length : Math.max(1, this.bufIdx);
        const meanSq = Math.max(0, this.sumSq) / count;
        const lufs = meanSq > 1e-10 ? (-0.691 + 10 * Math.log10(meanSq)) : -Infinity;
        this.port.postMessage({ lufs });
      }
    }
    return true;
  }
}
registerProcessor('lufs-meter', LUFSMeterProcessor);
