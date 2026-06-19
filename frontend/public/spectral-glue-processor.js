/**
 * Lumina Spectral Glue Compressor v1.0
 * 
 * Features:
 *  - Butterworth 2nd-order crossover at 200Hz.
 *  - Dynamic Mid/Side compression for the high band (>200Hz).
 *  - Compression ratios for Mid and Side modulated by real-time stereo correlation.
 *  - Gentle glue compression for the low band (<200Hz).
 */
class SpectralGlueProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    this.active = false; // Default disabled, toggleable
    this.thresholdDb = -24.0; // dBFS
    
    // Crossover SVF TPT at 200Hz (Butterworth Q=0.707)
    this.g = Math.tan(Math.PI * 200 / sr);
    this.k = 1.414;
    this.D = 1.0 + this.g * (this.g + this.k);
    
    const MAX_CH = 8;
    this.crossState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    
    // Compressor Envelopes
    this.envMid = 0;
    this.envSide = 0;
    this.envLow = 0;
    
    // Coeficientes do Compressor (Ataque: 20ms, Release: 150ms)
    this.attCoeff = Math.exp(-1.0 / (sr * 0.020));
    this.relCoeff = Math.exp(-1.0 / (sr * 0.150));
    
    // Coeficientes do Compressor do Grave (Ataque: 10ms, Release: 100ms)
    this.attCoeffLow = Math.exp(-1.0 / (sr * 0.010));
    this.relCoeffLow = Math.exp(-1.0 / (sr * 0.100));
    
    // Stereo Correlation Tracker
    this.covLR = 0.0;
    this.varL = 0.001;
    this.varR = 0.001;
    
    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.threshold !== undefined) this.thresholdDb = Math.max(-48.0, Math.min(e.data.threshold, -6.0));
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
    
    if (!this.active) {
      outL.set(inL);
      outR.set(inR);
      return true;
    }
    
    const size = inL.length;
    for (let i = 0; i < size; i++) {
      const L = inL[i];
      const R = inR[i];
      
      // 1. Crossover split a 200Hz
      const stateL = this.crossState[0];
      const vhp_L = (L - (this.g + this.k) * stateL[0] - stateL[1]) / this.D;
      const vbp_L = this.g * vhp_L + stateL[0];
      const vlp_L = this.g * vbp_L + stateL[1];
      stateL[0] = 2 * vbp_L - stateL[0];
      stateL[1] = 2 * vlp_L - stateL[1];
      
      const lowL = vlp_L;
      const highL = -vhp_L;
      
      const stateR = this.crossState[1];
      const vhp_R = (R - (this.g + this.k) * stateR[0] - stateR[1]) / this.D;
      const vbp_R = this.g * vhp_R + stateR[0];
      const vlp_R = this.g * vbp_R + stateR[1];
      stateR[0] = 2 * vbp_R - stateR[0];
      stateR[1] = 2 * vlp_R - stateR[1];
      
      const lowR = vlp_R;
      const highR = -vhp_R;
      
      // 2. Correlation Tracking na banda de média/alta frequência
      this.covLR = 0.999 * this.covLR + 0.001 * (highL * highR);
      this.varL = 0.999 * this.varL + 0.001 * (highL * highL);
      this.varR = 0.999 * this.varR + 0.001 * (highR * highR);
      
      const correlation = (this.varL > 1e-6 && this.varR > 1e-6) ? 
        Math.max(-0.99, Math.min(0.99, this.covLR / Math.sqrt(this.varL * this.varR))) : 1.0;
      
      // Relação de compressão dinâmica baseada na correlação
      // Alta correlação (mono) = mais compressão no Mid
      // Baixa correlação (wide/disjointed) = mais compressão no Side
      const midRatio = 1.5 + (correlation > 0 ? correlation * 0.6 : 0);
      const sideRatio = 1.5 + (correlation < 0.4 ? (0.4 - correlation) * 0.8 : 0);
      
      // 3. Conversão para M/S (Mid/Side)
      const mid = (highL + highR) * 0.70710678;
      const side = (highL - highR) * 0.70710678;
      
      // 4. Envelope Followers
      const absMid = Math.abs(mid);
      if (absMid > this.envMid) {
        this.envMid = this.attCoeff * this.envMid + (1.0 - this.attCoeff) * absMid;
      } else {
        this.envMid = this.relCoeff * this.envMid + (1.0 - this.relCoeff) * absMid;
      }
      
      const absSide = Math.abs(side);
      if (absSide > this.envSide) {
        this.envSide = this.attCoeff * this.envSide + (1.0 - this.attCoeff) * absSide;
      } else {
        this.envSide = this.relCoeff * this.envSide + (1.0 - this.relCoeff) * absSide;
      }
      
      // Envelope do grave
      const lowMono = (lowL + lowR) * 0.5;
      const absLow = Math.abs(lowMono);
      if (absLow > this.envLow) {
        this.envLow = this.attCoeffLow * this.envLow + (1.0 - this.attCoeffLow) * absLow;
      } else {
        this.envLow = this.relCoeffLow * this.envLow + (1.0 - this.relCoeffLow) * absLow;
      }
      
      // 5. Compressão
      const dbMid = 20.0 * Math.log10(this.envMid + 1e-6);
      const dbSide = 20.0 * Math.log10(this.envSide + 1e-6);
      const dbLow = 20.0 * Math.log10(this.envLow + 1e-6);
      
      let gainMid = 1.0;
      if (dbMid > this.thresholdDb) {
        const over = dbMid - this.thresholdDb;
        const targetDb = this.thresholdDb + over / midRatio;
        gainMid = Math.pow(10.0, (targetDb - dbMid) / 20.0);
      }
      
      let gainSide = 1.0;
      if (dbSide > this.thresholdDb) {
        const over = dbSide - this.thresholdDb;
        const targetDb = this.thresholdDb + over / sideRatio;
        gainSide = Math.pow(10.0, (targetDb - dbSide) / 20.0);
      }
      
      let gainLow = 1.0;
      const lowThresholdDb = -20.0;
      if (dbLow > lowThresholdDb) {
        const over = dbLow - lowThresholdDb;
        const targetDb = lowThresholdDb + over / 1.5; // ratio suave de 1.5
        gainLow = Math.pow(10.0, (targetDb - dbLow) / 20.0);
      }
      
      // 6. Reconstrução
      const compressedMid = mid * gainMid;
      const compressedSide = side * gainSide;
      
      const compressedHighL = (compressedMid + compressedSide) * 0.70710678;
      const compressedHighR = (compressedMid - compressedSide) * 0.70710678;
      
      const compressedLowL = lowL * gainLow;
      const compressedLowR = lowR * gainLow;
      
      outL[i] = compressedHighL + compressedLowL;
      outR[i] = compressedHighR + compressedLowR;
    }
    
    return true;
  }
}
registerProcessor('spectral-glue', SpectralGlueProcessor);
