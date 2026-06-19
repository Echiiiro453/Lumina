/**
 * Lumina Sub-bass Mono Maker & Bass Recovery v2.2
 * 
 * Crossover at 80Hz: converts sub-bass to mono, keeps stereo above.
 * Includes Psychoacoustic Bass Recovery: generates 2nd and 3rd harmonics of sub-bass,
 * high-pass filtered at 100Hz, to restore low-end perception on smaller speakers.
 */
class SubMonoProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
        const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    const fc = 80, Q = 0.707;
    const w0 = 2 * Math.PI * fc / sr;
    const cosW0 = Math.cos(w0), alpha = Math.sin(w0) / (2 * Q);
    const a0 = 1 + alpha;

    this.lpf = {
      b0: ((1 - cosW0) / 2) / a0, b1: (1 - cosW0) / a0, b2: ((1 - cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0, a2: (1 - alpha) / a0,
    };
    this.hpf = {
      b0: ((1 + cosW0) / 2) / a0, b1: (-(1 + cosW0)) / a0, b2: ((1 + cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0, a2: (1 - alpha) / a0,
    };

    // Filter states: [z1, z2] per filter per channel
    this.lpzL = [0, 0]; this.lpzR = [0, 0];
    this.hpzL = [0, 0]; this.hpzR = [0, 0];
    
    // Bass Recovery configurations
    this.bassRecovery = 0.5; // Gain for generated harmonics
    
    // SVF TPT coefficients for 100Hz HPF (to clean up generated harmonics)
    const fcHarm = 100;
    this.gHarm = Math.tan(Math.PI * fcHarm / sr);
    this.kHarm = 1.41421356;
    this.DHarm = 1.0 + this.gHarm * (this.gHarm + this.kHarm);
    
    this.harmSvfL = new Float32Array(2);
    this.harmSvfR = new Float32Array(2);
    
    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.bassRecovery !== undefined) {
        this.bassRecovery = Math.max(0, Math.min(e.data.bassRecovery, 2.0));
      }
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
    if (!input || input.length < 2 || !output || !output[0]) {
      if (input && input[0] && output && output[0]) output[0].set(input[0]);
      return true;
    }
    const inL = input[0], inR = input[1];
    const outL = output[0], outR = output[1];

    for (let i = 0; i < inL.length; i++) {
      const L = inL[i];
      const R = inR[i];
      
      const subL = this._bq(L, this.lpf, this.lpzL);
      const subR = this._bq(R, this.lpf, this.lpzR);
      const mono  = (subL + subR) * 0.5;
      
      // ── Psychoacoustic Bass Recovery ──
      // Generate 2nd and 3rd harmonics from sub-bass to trigger the "missing fundamental"
      const h2_L = subL * subL;
      const h3_L = subL * subL * subL;
      const rawHarm_L = 0.8 * h2_L + 0.4 * h3_L;
      
      const h2_R = subR * subR;
      const h3_R = subR * subR * subR;
      const rawHarm_R = 0.8 * h2_R + 0.4 * h3_R;
      
      // HPF at 100Hz (SVF TPT) to remove DC offset and clean low-end fundamental
      const vhp_hL = (rawHarm_L - (this.gHarm + this.kHarm) * this.harmSvfL[0] - this.harmSvfL[1]) / this.DHarm;
      const vbp_hL = this.gHarm * vhp_hL + this.harmSvfL[0];
      const vlp_hL = this.gHarm * vbp_hL + this.harmSvfL[1];
      this.harmSvfL[0] = 2 * vbp_hL - this.harmSvfL[0];
      this.harmSvfL[1] = 2 * vlp_hL - this.harmSvfL[1];
      
      const vhp_hR = (rawHarm_R - (this.gHarm + this.kHarm) * this.harmSvfR[0] - this.harmSvfR[1]) / this.DHarm;
      const vbp_hR = this.gHarm * vhp_hR + this.harmSvfR[0];
      const vlp_hR = this.gHarm * vbp_hR + this.harmSvfR[1];
      this.harmSvfR[0] = 2 * vbp_hR - this.harmSvfR[0];
      this.harmSvfR[1] = 2 * vlp_hR - this.harmSvfR[1];
      
      const hiL = this._bq(L, this.hpf, this.hpzL);
      const hiR = this._bq(R, this.hpf, this.hpzR);
      
      outL[i] = hiL + mono + this.bassRecovery * vhp_hL;
      outR[i] = hiR + mono + this.bassRecovery * vhp_hR;
    }
    return true;
  }
}
registerProcessor('submono', SubMonoProcessor);
