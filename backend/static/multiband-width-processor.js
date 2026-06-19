/**
 * Lumina Multiband Width Processor v1.2
 * 
 * Splits the stereo signal into 3 bands:
 *  - Low (<150Hz): Mixed to mono (0% width) for punchy, stable bass.
 *  - Mid (150Hz - 2.2kHz): User selected width (Constant Power MS).
 *  - High (>2.2kHz): Extra wide width (user * 1.25, max 1.8) for spacious highs.
 * 
 * Uses Linkwitz-Riley 4th Order (LR4) crossovers via cascaded SVF TPT filters
 * to guarantee perfect reconstruction and steep frequency separation.
 */
class MultibandWidthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    // Crossover 1: 150Hz
    this.g1 = Math.tan(Math.PI * 150 / sr);
    this.k1 = 1.41421356;
    this.D1 = 1.0 + this.g1 * (this.g1 + this.k1);
    
    // Crossover 2: 2200Hz
    this.g2 = Math.tan(Math.PI * 2200 / sr);
    this.k2 = 1.41421356;
    this.D2 = 1.0 + this.g2 * (this.g2 + this.k2);
    
    const MAX_CH = 8;
    // Crossover 1 states (2 cascaded stages for LP and HP)
    this.svf1A = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.svf1B_lp = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.svf1B_hp = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    
    // Crossover 2 states (2 cascaded stages for LP and HP)
    this.svf2A = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.svf2B_lp = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.svf2B_hp = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    
    this.width = 1.0; // Base width
    
    this.port.onmessage = (e) => {
      if (e.data.width !== undefined) {
        this.width = Math.max(0, Math.min(e.data.width, 2.0));
      }
    };
  }
  
  _svfStep(sample, state, g, k, D) {
    const vhp = (sample - (g + k) * state[0] - state[1]) / D;
    const vbp = g * vhp + state[0];
    const vlp = g * vbp + state[1];
    
    state[0] = 2 * vbp - state[0];
    state[1] = 2 * vlp - state[1];
    
    return { lp: vlp, hp: vhp };
  }
  
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input || input.length < 2 || !output || !output[0]) {
      if (input && input[0] && output && output[0]) {
        output[0].set(input[0]);
        if (input[1] && output[1]) output[1].set(input[1]);
      }
      return true;
    }
    
    const inL = input[0], inR = input[1];
    const outL = output[0], outR = output[1];
    
    const wMid = this.width;
    const wHigh = Math.min(1.8, this.width * 1.25);
    
    // Mid width coefficients
    const thetaMid = wMid * Math.PI / 4;
    const gMid_mid = Math.cos(thetaMid) * 0.70711;
    const gSide_mid = Math.sin(thetaMid) * 0.70711;
    
    // High width coefficients
    const thetaHigh = wHigh * Math.PI / 4;
    const gMid_high = Math.cos(thetaHigh) * 0.70711;
    const gSide_high = Math.sin(thetaHigh) * 0.70711;
    
    for (let i = 0; i < inL.length; i++) {
      const L = inL[i];
      const R = inR[i];
      
      // 1. Crossover 1: 150Hz (LR4 LP and HP)
      // Left channel
      const res1A_L = this._svfStep(L, this.svf1A[0], this.g1, this.k1, this.D1);
      const lowL = this._svfStep(res1A_L.lp, this.svf1B_lp[0], this.g1, this.k1, this.D1).lp;
      const midHighL = this._svfStep(res1A_L.hp, this.svf1B_hp[0], this.g1, this.k1, this.D1).hp;
      
      // Right channel
      const res1A_R = this._svfStep(R, this.svf1A[1], this.g1, this.k1, this.D1);
      const lowR = this._svfStep(res1A_R.lp, this.svf1B_lp[1], this.g1, this.k1, this.D1).lp;
      const midHighR = this._svfStep(res1A_R.hp, this.svf1B_hp[1], this.g1, this.k1, this.D1).hp;
      
      // 2. Crossover 2: 2.2kHz (LR4 LP and HP)
      // Left channel
      const res2A_L = this._svfStep(midHighL, this.svf2A[0], this.g2, this.k2, this.D2);
      const midL = this._svfStep(res2A_L.lp, this.svf2B_lp[0], this.g2, this.k2, this.D2).lp;
      const highL = this._svfStep(res2A_L.hp, this.svf2B_hp[0], this.g2, this.k2, this.D2).hp;
      
      // Right channel
      const res2A_R = this._svfStep(midHighR, this.svf2A[1], this.g2, this.k2, this.D2);
      const midR = this._svfStep(res2A_R.lp, this.svf2B_lp[1], this.g2, this.k2, this.D2).lp;
      const highR = this._svfStep(res2A_R.hp, this.svf2B_hp[1], this.g2, this.k2, this.D2).hp;
      
      // 3. Process bands using Mid/Side constant power equations
      // Low band -> Mono sum (0% width)
      const lowMono = 0.5 * (lowL + lowR);
      
      // Mid band M/S
      const midM = (midL + midR) / 1.41421356;
      const midS = (midL - midR) / 1.41421356;
      const midOutL = (midM * gMid_mid + midS * gSide_mid) * 1.41421356;
      const midOutR = (midM * gMid_mid - midS * gSide_mid) * 1.41421356;
      
      // High band M/S
      const highM = (highL + highR) / 1.41421356;
      const highS = (highL - highR) / 1.41421356;
      const highOutL = (highM * gMid_high + highS * gSide_high) * 1.41421356;
      const highOutR = (highM * gMid_high - highS * gSide_high) * 1.41421356;
      
      // 4. Sum bands to output
      outL[i] = lowMono + midOutL + highOutL;
      outR[i] = lowMono + midOutR + highOutR;
    }
    
    return true;
  }
}
registerProcessor('multiband-width', MultibandWidthProcessor);
