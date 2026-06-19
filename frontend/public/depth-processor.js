/**
 * Lumina Adaptive Stereo Depth Processor v1.1
 * 
 * Creates psychoacoustic depth (Near/Far spatial cues) by applying:
 *  - EQ Tilt: Darkens the center (Mid) and brightens the sides (Side) as depth increases.
 *  - Fractional Pre-delay: Introduces a dynamic delay (up to 15ms) on the Side channel with linear interpolation to eliminate zipper noise.
 *  - Branchless Soft-Knee Transient Softness: Attenuates sharp transients in the Mid channel with a differentiable soft knee to simulate air absorption over distance.
 */
class DepthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    this.active = false;
    this.depth = 0.0; // 0.0 (Near/Direct) to 1.0 (Far/Deep)
    
    // States for 1st-order Highpass Filters (for High-Shelf Tilt)
    this.prevMid = new Float32Array(2);
    this.prevHpMid = new Float32Array(2);
    this.prevSide = new Float32Array(2);
    this.prevHpSide = new Float32Array(2);
    
    // Side Delay Buffer (1024 samples ~ 23ms)
    this.delayLength = 1024;
    this.sideDelayBuf = new Float32Array(this.delayLength);
    this.sideWritePtr = 0;
    this.currDelay = 0.0;
    
    // Transient Shaper Envelopes for Mid
    this.midEnvFast = 0.0;
    this.midEnvSlow = 0.0;
    
    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.depth !== undefined) this.depth = Math.max(0.0, Math.min(e.data.depth, 1.0));
    };
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
    
    if (!this.active || this.depth < 0.01) {
      outL.set(inL);
      outR.set(inR);
      return true;
    }
    
    const size = inL.length;
    for (let i = 0; i < size; i++) {
      const L = inL[i];
      const R = inR[i];
      
      // 1. Converter para Mid/Side
      const mid = (L + R) * 0.70710678;
      const side = (L - R) * 0.70710678;
      
      // 2. EQ Tilt (High Shelf Filters a ~4kHz)
      // Mid Channel (Corta agudos de até -6dB para simular absorção do ar)
      const hpMid = 0.57 * (mid - this.prevMid[0]) + 0.57 * this.prevHpMid[0];
      this.prevMid[0] = mid;
      this.prevHpMid[0] = hpMid;
      const midTilt = -6.0 * this.depth;
      const midTiltGain = Math.pow(10.0, midTilt / 20.0) - 1.0;
      const processedMid = mid + midTiltGain * hpMid;
      
      // Side Channel (Reforça agudos de até +3dB para abrir o estéreo lateral)
      const hpSide = 0.57 * (side - this.prevSide[0]) + 0.57 * this.prevHpSide[0];
      this.prevSide[0] = side;
      this.prevHpSide[0] = hpSide;
      const sideTilt = 3.0 * this.depth;
      const sideTiltGain = Math.pow(10.0, sideTilt / 20.0) - 1.0;
      const processedSide = side + sideTiltGain * hpSide;
      
      // 3. Pre-delay fracionário nas laterais (Side delay com interpolação linear)
      this.sideDelayBuf[this.sideWritePtr] = processedSide;
      
      const targetDelay = this.depth * 600.0;
      this.currDelay = 0.999 * this.currDelay + 0.001 * targetDelay;
      
      const delayInt = Math.floor(this.currDelay);
      const delayFrac = this.currDelay - delayInt;
      
      const readPtr1 = (this.sideWritePtr - delayInt + this.delayLength) % this.delayLength;
      const readPtr2 = (readPtr1 - 1 + this.delayLength) % this.delayLength;
      const delayedSide = (1.0 - delayFrac) * this.sideDelayBuf[readPtr1] + delayFrac * this.sideDelayBuf[readPtr2];
      
      this.sideWritePtr = (this.sideWritePtr + 1) % this.delayLength;
      
      // 4. Transient Softness no Mid (Soft-Knee Transient Shaper sem branches)
      const absMid = Math.abs(processedMid);
      this.midEnvFast = 0.9 * this.midEnvFast + 0.1 * absMid;
      this.midEnvSlow = 0.995 * this.midEnvSlow + 0.005 * absMid;
      
      const transientRatio = this.midEnvSlow > 1e-4 ? this.midEnvFast / this.midEnvSlow : 1.0;
      
      // Diferença em relação ao threshold de 1.3
      const diff = transientRatio - 1.3;
      // Retificação suave (soft knee) para evitar degraus na resposta
      const smoothDiff = 0.5 * (diff + Math.sqrt(diff * diff + 0.01));
      const attFactor = 1.5 * Math.tanh(smoothDiff / 1.5);
      
      const transientGain = 1.0 - this.depth * 0.35 * attFactor;
      const transientSoftMid = processedMid * transientGain;
      
      // 5. Reconstruir L/R
      outL[i] = (transientSoftMid + delayedSide) * 0.70710678;
      outR[i] = (transientSoftMid - delayedSide) * 0.70710678;
    }
    
    return true;
  }
}
registerProcessor('depth', DepthProcessor);
