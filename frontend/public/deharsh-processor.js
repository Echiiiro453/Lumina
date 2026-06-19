/**
 * Lumina Dynamic De-Harshing Processor v1.5
 * 
 * Features:
 *  - Dynamic SVF TPT Bell notch centered at 4.5kHz.
 *  - Temporal Smoothing: Adaptive Attack and Release times based on signal Crest Factor.
 */
class DeHarshProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    this.sr = sr;
    
    // Configurações do processador
    this.active = true;
    this.threshold = 0.08;  // ~ -22dBFS
    this.sensitivity = 3.0; // Fator de escala da redução
    
    // Coeficientes do Detector Bandpass (5kHz, Q=0.8)
    this.gDetect = Math.tan(Math.PI * 5000 / sr);
    this.kDetect = 1.0 / 0.8;
    this.DDetect = 1.0 + this.gDetect * (this.gDetect + this.kDetect);
    
    // Coeficientes do Filtro Dinâmico Bell (4500Hz, Q=1.2)
    this.gBell = Math.tan(Math.PI * 4500 / sr);
    this.kBell = 1.0 / 1.2;
    this.DBell = 1.0 + this.gBell * (this.gBell + this.kBell);
    this.g_plus_k = this.gBell + this.kBell;
    
    const MAX_CH = 8;
    this.detectState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    this.bellState = Array.from({ length: MAX_CH }, () => new Float32Array(2));
    
    // Envelope detector adaptativo
    this.env = 0;
    this.peakTracker = 0.1;
    this.rmsTracker = 0.05;
    this.currAttackCoeff = Math.exp(-1.0 / (sr * 0.005));
    this.currReleaseCoeff = Math.exp(-1.0 / (sr * 0.120));
    
    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.active !== undefined) this.active = !!e.data.active;
      if (e.data.threshold !== undefined) this.threshold = Math.max(0.001, Math.min(e.data.threshold, 0.5));
      if (e.data.sensitivity !== undefined) this.sensitivity = Math.max(0.1, Math.min(e.data.sensitivity, 10.0));
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
    
    // 1. Atualizar coeficientes de envelope baseados no Crest Factor do bloco anterior
    const crestFactor = this.rmsTracker > 1e-5 ? this.peakTracker / this.rmsTracker : 3.0;
    const factorScale = Math.max(0.5, Math.min(4.0, crestFactor / 3.0));
    const dynAttackMs = 5.0 * factorScale; 
    const dynReleaseMs = 120.0 * factorScale;
    
    this.currAttackCoeff = Math.exp(-1.0 / (this.sr * (dynAttackMs / 1000.0)));
    this.currReleaseCoeff = Math.exp(-1.0 / (this.sr * (dynReleaseMs / 1000.0)));
    
    // Trackers para o bloco atual
    let blockMaxAmp = 0;
    let blockPowerSum = 0;
    const sampleCount = inL.length;
    
    for (let i = 0; i < sampleCount; i++) {
      const L = inL[i];
      const R = inR[i];
      
      const amp = Math.max(Math.abs(L), Math.abs(R));
      if (amp > blockMaxAmp) blockMaxAmp = amp;
      blockPowerSum += (L * L + R * R) * 0.5;
      
      // 2. Filtrar canal L e R com Bandpass Detector
      const stateL = this.detectState[0];
      const vhp_L = (L - (this.gDetect + this.kDetect) * stateL[0] - stateL[1]) / this.DDetect;
      const vbp_L = this.gDetect * vhp_L + stateL[0];
      const vlp_L = this.gDetect * vbp_L + stateL[1];
      stateL[0] = 2 * vbp_L - stateL[0];
      stateL[1] = 2 * vlp_L - stateL[1];
      
      const stateR = this.detectState[1];
      const vhp_R = (R - (this.gDetect + this.kDetect) * stateR[0] - stateR[1]) / this.DDetect;
      const vbp_R = this.gDetect * vhp_R + stateR[0];
      const vlp_R = this.gDetect * vbp_R + stateR[1];
      stateR[0] = 2 * vbp_R - stateR[0];
      stateR[1] = 2 * vlp_R - stateR[1];
      
      // 3. Retificar e obter a energia estéreo combinada
      const rect = Math.max(Math.abs(vbp_L), Math.abs(vbp_R));
      
      // Envelope tracker adaptativo
      if (rect > this.env) {
        this.env = this.currAttackCoeff * this.env + (1.0 - this.currAttackCoeff) * rect;
      } else {
        this.env = this.currReleaseCoeff * this.env + (1.0 - this.currReleaseCoeff) * rect;
      }
      
      // 4. Calcular ganho dinâmico do Notch (K)
      let K = 1.0;
      if (this.env > this.threshold) {
        const depth = (this.env - this.threshold) * this.sensitivity;
        K = Math.max(0.4, 1.0 - depth); // Redução máx de -8dB
      }
      
      // 5. Aplicar o Dynamic SVF TPT Bell Filter nos canais L e R
      // Left channel Bell
      const bStateL = this.bellState[0];
      const vhp_bL = (L - this.g_plus_k * bStateL[0] - bStateL[1]) / this.DBell;
      const vbp_bL = this.gBell * vhp_bL + bStateL[0];
      const vlp_bL = this.gBell * vbp_bL + bStateL[1];
      bStateL[0] = 2 * vbp_bL - bStateL[0];
      bStateL[1] = 2 * vlp_bL - bStateL[1];
      
      // Bell output equation: y = x + (K - 1) * k * vbp
      outL[i] = L + (K - 1.0) * this.kBell * vbp_bL;
      
      // Right channel Bell
      const bStateR = this.bellState[1];
      const vhp_bR = (R - this.g_plus_k * bStateR[0] - bStateR[1]) / this.DBell;
      const vbp_bR = this.gBell * vhp_bR + bStateR[0];
      const vlp_bR = this.gBell * vbp_bR + bStateR[1];
      bStateR[0] = 2 * vbp_bR - bStateR[0];
      bStateR[1] = 2 * vlp_bR - bStateR[1];
      
      outR[i] = R + (K - 1.0) * this.kBell * vbp_bR;
    }
    
    // Atualiza os trackers para o próximo bloco
    if (sampleCount > 0) {
      const blockRms = Math.sqrt(blockPowerSum / sampleCount);
      this.peakTracker = 0.95 * this.peakTracker + 0.05 * blockMaxAmp;
      this.rmsTracker = 0.95 * this.rmsTracker + 0.05 * blockRms;
    }
    
    return true;
  }
}
registerProcessor('deharsh', DeHarshProcessor);
