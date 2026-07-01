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
    this.telemetryEnabled = true;
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    // Crossover 1: 150Hz
    this.g1 = Math.tan(Math.PI * 150 / sr);
    this.k1 = 1.41421356;
    this.D1 = 1.0 + this.g1 * (this.g1 + this.k1);
    
    // Crossover 2: 4000Hz (LOW: 20-150Hz, MID: 150Hz-4kHz, HIGH: 4k-20kHz)
    this.g2 = Math.tan(Math.PI * 4000 / sr);
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
    this.governorScale = 1.0; // Dynamic stereo width limiter / safety governor
    this.lowSideGain = 0.3; // Default low band side gain (maximum 30% width)
    this.frame = 0;
    this.subMonoOverride = false;
    
    this.port.onmessage = (e) => {
      if (e.data?.type === 'setTelemetryEnabled') { this.telemetryEnabled = !!e.data.enabled; return; }
      if (e.data.width !== undefined) {
        this.width = Math.max(0, Math.min(e.data.width, 2.0));
      }
      if (e.data.subMono !== undefined) {
        this.subMonoOverride = !!e.data.subMono;
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
    
    const wMid = this.width * this.governorScale;
    const wHigh = Math.min(1.8, wMid * 1.25);
    
    // Mid width coefficients
    const thetaMid = wMid * Math.PI / 4;
    const gMid_mid = Math.cos(thetaMid) * 0.70711;
    const gSide_mid = Math.sin(thetaMid) * 0.70711;
    
    // High width coefficients
    const thetaHigh = wHigh * Math.PI / 4;
    const gMid_high = Math.cos(thetaHigh) * 0.70711;
    const gSide_high = Math.sin(thetaHigh) * 0.70711;
    
    let lowInputSumL2 = 0, lowInputSumR2 = 0, lowInputSumLR = 0;
    let lowOutputSumL2 = 0, lowOutputSumR2 = 0, lowOutputSumLR = 0;
    let midSumL2 = 0, midSumR2 = 0, midSumLR = 0;
    let highSumL2 = 0, highSumR2 = 0, highSumLR = 0;

    for (let i = 0; i < inL.length; i++) {
      const L = inL[i] || 0;
      const R = inR[i] || 0;
      
      // 1. Crossover 1: 150Hz (LR4 LP and HP)
      // Left channel
      const res1A_L = this._svfStep(L, this.svf1A[0], this.g1, this.k1, this.D1);
      const lowL = this._svfStep(res1A_L.lp, this.svf1B_lp[0], this.g1, this.k1, this.D1).lp;
      const midHighL = this._svfStep(res1A_L.hp, this.svf1B_hp[0], this.g1, this.k1, this.D1).hp;
      
      // Right channel
      const res1A_R = this._svfStep(R, this.svf1A[1], this.g1, this.k1, this.D1);
      const lowR = this._svfStep(res1A_R.lp, this.svf1B_lp[1], this.g1, this.k1, this.D1).lp;
      const midHighR = this._svfStep(res1A_R.hp, this.svf1B_hp[1], this.g1, this.k1, this.D1).hp;
      
      // 2. Crossover 2: 4.0kHz (LR4 LP and HP)
      // Left channel
      const res2A_L = this._svfStep(midHighL, this.svf2A[0], this.g2, this.k2, this.D2);
      const midL = this._svfStep(res2A_L.lp, this.svf2B_lp[0], this.g2, this.k2, this.D2).lp;
      const highL = this._svfStep(res2A_L.hp, this.svf2B_hp[0], this.g2, this.k2, this.D2).hp;
      
      // Right channel
      const res2A_R = this._svfStep(midHighR, this.svf2A[1], this.g2, this.k2, this.D2);
      const midR = this._svfStep(res2A_R.lp, this.svf2B_lp[1], this.g2, this.k2, this.D2).lp;
      const highR = this._svfStep(res2A_R.hp, this.svf2B_hp[1], this.g2, this.k2, this.D2).hp;
      
      // Accumulate input energies for low-band stereo governor
      lowInputSumL2 += lowL * lowL;
      lowInputSumR2 += lowR * lowR;
      lowInputSumLR += lowL * lowR;

      midSumL2 += midL * midL;
      midSumR2 += midR * midR;
      midSumLR += midL * midR;

      highSumL2 += highL * highL;
      highSumR2 += highR * highR;
      highSumLR += highL * highR;

      // 3. Process bands using Mid/Side constant power equations
      // Low band -> Mid/Side with dynamic safeSide to prevent out-of-phase cancellation!
      const lowM = (lowL + lowR) * 0.70710678;
      const lowS = (lowL - lowR) * 0.70710678;
      const safeSide = lowS * this.lowSideGain;
      const lowOutL = (lowM + safeSide) * 0.70710678;
      const lowOutR = (lowM - safeSide) * 0.70710678;

      // Accumulate output energies for processed low-band telemetry
      lowOutputSumL2 += lowOutL * lowOutL;
      lowOutputSumR2 += lowOutR * lowOutR;
      lowOutputSumLR += lowOutL * lowOutR;
      
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
      outL[i] = lowOutL + midOutL + highOutL;
      outR[i] = lowOutR + midOutR + highOutR;
    }
    
    this.frame++;
    if (this.frame % 10 === 0) {
      const eps = 1e-12;
      
      // Low Band Input for Governor
      const lowInputCorr = lowInputSumLR / Math.sqrt(lowInputSumL2 * lowInputSumR2 + eps);
      const lowInputMidRMS = Math.sqrt(lowInputSumL2 + lowInputSumR2 + 2 * lowInputSumLR);
      const lowInputSideRMS = Math.sqrt(lowInputSumL2 + lowInputSumR2 - 2 * lowInputSumLR);
      const lowInputWidth = lowInputSideRMS / (lowInputMidRMS + eps);

      // Low-Band Stereo Governor:
      // If correlation < 0.20 or width > 60% (0.60), reduce side gain.
      // If correlation < 0.00 or width > 100% (1.00), force mono even more.
      let targetLowSideGain = 0.30; // 30% side width by default
      if (this.subMonoOverride) {
        targetLowSideGain = 0.0; // Force pure mono
      } else if (lowInputCorr < 0.0 || lowInputWidth > 1.0) {
        targetLowSideGain = 0.02; // Almost pure mono (2%)
      } else if (lowInputCorr < 0.2 || lowInputWidth > 0.6) {
        targetLowSideGain = 0.12; // High compatibility mono (12%)
      }
      // Smooth transitions to prevent clicks
      this.lowSideGain = this.lowSideGain * 0.92 + targetLowSideGain * 0.08;

      // Low Band Output for Telemetry
      const lowCorr = lowOutputSumLR / Math.sqrt(lowOutputSumL2 * lowOutputSumR2 + eps);
      const lowMidRMS = Math.sqrt(lowOutputSumL2 + lowOutputSumR2 + 2 * lowOutputSumLR);
      const lowSideRMS = Math.sqrt(lowOutputSumL2 + lowOutputSumR2 - 2 * lowOutputSumLR);
      const lowWidth = lowSideRMS / (lowMidRMS + eps);

      // Mid Band
      const midCorr = midSumLR / Math.sqrt(midSumL2 * midSumR2 + eps);
      const midMidRMS = Math.sqrt(midSumL2 + midSumR2 + 2 * midSumLR);
      const midSideRMS = Math.sqrt(midSumL2 + midSumR2 - 2 * midSumLR);
      const midWidth = midSideRMS / (midMidRMS + eps);

      // Stereo Governor Logic
      // If mid correlation < 0.15 and width exceeds 90% (0.9), reduce width gain
      if (midCorr < 0.15 && this.width > 0.9) {
        this.governorScale = Math.max(0.4, this.governorScale - 0.05);
      } else {
        this.governorScale = Math.min(1.0, this.governorScale + 0.01);
      }

      // High Band
      const highCorr = highSumLR / Math.sqrt(highSumL2 * highSumR2 + eps);
      const highMidRMS = Math.sqrt(highSumL2 + highSumR2 + 2 * highSumLR);
      const highSideRMS = Math.sqrt(highSumL2 + highSumR2 - 2 * highSumLR);
      const highWidth = highSideRMS / (highMidRMS + eps);

      if (this.telemetryEnabled) this.port.postMessage({ type: 'telemetry',
        name: "MultibandStereo",
        lowCorr: isNaN(lowCorr) ? "1.00" : lowCorr.toFixed(2),
        lowWidth: Math.min(200, Math.max(0, lowWidth * 100)).toFixed(0) + "%",
        midCorr: isNaN(midCorr) ? "1.00" : midCorr.toFixed(2),
        midWidth: Math.min(200, Math.max(0, midWidth * 100)).toFixed(0) + "%",
        highCorr: isNaN(highCorr) ? "1.00" : highCorr.toFixed(2),
        highWidth: Math.min(200, Math.max(0, highWidth * 100)).toFixed(0) + "%",
        bassMonoSafe: lowCorr > 0.50 || lowWidth < 0.35,
        governorScale: this.governorScale.toFixed(2),
        governorActive: this.governorScale < 0.99 || this.lowSideGain < 0.29
      });
    }
    
    return true;
  }
}
registerProcessor('multiband-width', MultibandWidthProcessor);
