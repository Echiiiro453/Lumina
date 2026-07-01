/**
 * Lumina Dynamic Harmonic Exciter v3.6
 * 
 * Features:
 *  - 2x Oversampling (Linear Interpolation + Nyquist Decimation LPF)
 *  - Branchless 1st-order ADAA (Anti-Derivative Anti-Aliasing) Saturation with Dynamic Error Observer
 *  - Transient-Preservation Drive Scaling (Spectral-aware): dynamically scales down drive during sharp attacks to prevent transient smearing.
 *  - SVF TPT 2.5kHz High-Pass Filter Crossover
 *  - Dynamic Wet Blend based on real-time signal RMS (Dynamic Exciter)
 *  - Dynamic Masking Model: reduces excitation in the presence of strong 3k-5k energy (vocals).
 */
class ExciterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.telemetryEnabled = true;
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    this.amount = 0.5; // Default amount 0 to 1
    
    // SVF HPF coefficients (2.5kHz cutoff, Q=0.707)
    this.g = Math.tan(Math.PI * 2500 / sr);
    this.k = 1.0 / 0.707;
    this.D = 1.0 + this.g * (this.g + this.k);
    
    // Crossover/Masking Bandpass Detector (4kHz, Q=1.0)
    this.gMask = Math.tan(Math.PI * 4000 / sr);
    this.kMask = 1.0 / 1.0;
    this.DMask = 1.0 + this.gMask * (this.gMask + this.kMask);
    
    const MAX_CH = 8;
    this.hpfState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.maskState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.lastIn = new Float32Array(MAX_CH);
    this.lastSat = new Float32Array(MAX_CH);
    this.rms = new Float32Array(MAX_CH);
    this.maskRms = new Float32Array(MAX_CH);
    
    // Envelopes for Transient-Preservation
    this.fastEnv = new Float32Array(MAX_CH);
    this.slowEnv = new Float32Array(MAX_CH);
    
    this.active = false;
    this.port.onmessage = (e) => {
      if (e.data?.type === 'setTelemetryEnabled') { this.telemetryEnabled = !!e.data.enabled; return; }
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.amount !== undefined) {
        this.amount = Math.max(0, Math.min(e.data.amount, 1.0));
      }
    };
  }
  
  _logCosh(x) {
    const absX = Math.abs(x);
    if (absX > 20) return absX - 0.6931471805599453;
    return Math.log(Math.cosh(x));
  }
  
  // Asymmetric Warm Saturation f(x) = tanh(x*drive) - 0.1 * tanh^2(x*drive)
  _f(x, drive) {
    const u = x * drive;
    const y = Math.tanh(u);
    return y - 0.1 * y * y;
  }
  
  // Antiderivative of f(x)
  _F(x, drive) {
    const u = x * drive;
    const term1 = this._logCosh(u) / drive;
    const term2 = 0.1 * (u - Math.tanh(u)) / drive;
    return term1 - term2;
  }
  
  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;

    if (!this.active || this.amount < 0.01) {
      output[0].set(input[0]);
      if (input[1] && output[1]) output[1].set(input[1]);
      return true;
    }
    
    const chs = input.length;
    for (let ch = 0; ch < chs; ch++) {
      const inCh = input[ch], outCh = output[ch];
      if (!outCh) continue;
      
      const hState = this.hpfState[ch];
      const mState = this.maskState[ch];
      let prevX = this.lastIn[ch];
      let prevSat = this.lastSat[ch];
      
      for (let i = 0; i < inCh.length; i++) {
        const x = inCh[i];
        const absX = Math.abs(x);
        
        // Dynamic RMS tracker (smoothed)
        this.rms[ch] = 0.9995 * this.rms[ch] + 0.0005 * (x * x);
        
        // 1. Filtrar com Bandpass Detector de Mascaramento em 4kHz
        const vhp_m = (x - (this.gMask + this.kMask) * mState[0] - mState[1]) / this.DMask;
        const vbp_m = this.gMask * vhp_m + mState[0];
        const vlp_m = this.gMask * vbp_m + mState[1];
        mState[0] = 2 * vbp_m - mState[0];
        mState[1] = 2 * vlp_m - mState[1];
        
        // Medir RMS do sinal mascarado
        this.maskRms[ch] = 0.9995 * this.maskRms[ch] + 0.0005 * (vbp_m * vbp_m);
        
        // 2. Transient-Preservation Envelope Split (Spectral-aware)
        let fEnv = this.fastEnv[ch];
        let sEnv = this.slowEnv[ch];
        if (isNaN(fEnv) || !isFinite(fEnv)) fEnv = 0.0;
        if (isNaN(sEnv) || !isFinite(sEnv)) sEnv = 0.0;
        
        fEnv = 0.9 * fEnv + 0.1 * absX;
        sEnv = 0.995 * sEnv + 0.005 * absX;
        this.fastEnv[ch] = fEnv;
        this.slowEnv[ch] = sEnv;
        
        const transientRatio = sEnv > 1e-4 ? fEnv / sEnv : 1.0;
        // Dynamically scale down drive during fast attacks to protect transient sharpness
        const drive = 2.0 / (1.0 + 0.6 * Math.max(0.0, transientRatio - 1.3));
        
        // ── 2x Oversampling loop ──
        // Generate interpolated midpoint sample
        const xMid = 0.5 * (x + prevX);
        
        // High-pass filter both samples (2.5kHz)
        // Mid sample HPF
        const vhp_mid = (xMid - (this.g + this.k) * hState[0] - hState[1]) / this.D;
        const vbp_mid = this.g * vhp_mid + hState[0];
        const vlp_mid = this.g * vbp_mid + hState[1];
        hState[0] = 2 * vbp_mid - hState[0];
        hState[1] = 2 * vlp_mid - hState[1];
        
        // Curr sample HPF
        const vhp_curr = (x - (this.g + this.k) * hState[0] - hState[1]) / this.D;
        const vbp_curr = this.g * vhp_curr + hState[0];
        const vlp_curr = this.g * vbp_curr + hState[1];
        hState[0] = 2 * vbp_curr - hState[0];
        hState[1] = 2 * vlp_curr - hState[1];
        
        // Apply branchless ADAA1 to both HPF samples
        // Saturation 1 (midpoint)
        const diff1 = vhp_mid - prevSat;
        const absDiff1 = Math.abs(diff1);
        const eps1 = 1e-5;
        const u1 = Math.min(1.0, absDiff1 / eps1);
        const w1 = u1 * u1 * (3.0 - 2.0 * u1);
        
        const sat1_ADAA = (u1 >= 1.0) ? (this._F(vhp_mid, drive) - this._F(prevSat, drive)) / (diff1 + 1e-30) : 0.0;
        const sat1_f = this._f(0.5 * (vhp_mid + prevSat), drive);
        const sat1 = w1 * sat1_ADAA + (1.0 - w1) * sat1_f;
        
        // Saturation 2 (current)
        const diff2 = vhp_curr - vhp_mid;
        const absDiff2 = Math.abs(diff2);
        const eps2 = 1e-5;
        const u2 = Math.min(1.0, absDiff2 / eps2);
        const w2 = u2 * u2 * (3.0 - 2.0 * u2);
        
        const sat2_ADAA = (u2 >= 1.0) ? (this._F(vhp_curr, drive) - this._F(vhp_mid, drive)) / (diff2 + 1e-30) : 0.0;
        const sat2_f = this._f(0.5 * (vhp_curr + vhp_mid), drive);
        const sat2 = w2 * sat2_ADAA + (1.0 - w2) * sat2_f;
        
        // Downsample via decimation (averaging) LPF
        const excited = 0.5 * (sat1 + sat2);
        
        // Dynamic wet/dry mix based on RMS density and Masking Model
        const rmsVal = Math.sqrt(this.rms[ch]);
        const maskVal = Math.sqrt(this.maskRms[ch]);
        
        // Se houver muita energia na faixa vocálica central (3k-5k), reduz o exciter (Dynamic Masking)
        const maskingFactor = Math.max(0.15, 1.0 - (maskVal * 3.5));
        const dynamicWet = this.amount * (1.0 - Math.min(0.85, rmsVal * 2.5)) * maskingFactor;
        const dry = 1.0 - dynamicWet * 0.5;
        
        outCh[i] = dry * x + dynamicWet * excited;
        
        prevX = x;
        prevSat = vhp_curr;
      }
      this.lastIn[ch] = prevX;
      this.lastSat[ch] = prevSat;
    }
    return true;
  }
}
registerProcessor('exciter', ExciterProcessor);
