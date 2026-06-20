/**
 * Lumina Room Telemetry Processor
 * 
 * Atua como um Mixer Inteligente de 2 entradas (Dry e Wet).
 * Coleta métricas rigorosas de acústica de ambientes (Salas/Reverbs).
 */
class RoomTelemetryProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.preset = "Estúdio";
    this.preDelayMs = 0;
    this.rt60 = 0;
    this.wetMix = 0.0;
    
    // Accumulators for Telemetry
    this._telemetryCount = 0;
    this._sumDryL = 0; this._sumDryR = 0;
    this._sumWetL = 0; this._sumWetR = 0;
    
    // Mono correlation / Loss
    this._sumDryMid = 0;
    this._sumWetMid = 0;
    
    // ER vs Tail estimation (Envelope followers)
    this._erEnv = 0.0;
    this._tailEnv = 0.0;
    this._sumEr = 0.0;
    this._sumTail = 0.0;
    
    this.port.onmessage = (e) => {
      if (e.data.preset !== undefined) this.preset = e.data.preset;
      if (e.data.preDelayMs !== undefined) this.preDelayMs = e.data.preDelayMs;
      if (e.data.rt60 !== undefined) this.rt60 = e.data.rt60;
      if (e.data.wetMix !== undefined) this.wetMix = e.data.wetMix;
    };
  }

  process(inputs, outputs) {
    const dryInput = inputs[0];
    const wetInput = inputs[1]; // Convolver output
    const output = outputs[0];
    
    if (!dryInput || dryInput.length < 2) return true;
    
    const dryL = dryInput[0];
    const dryR = dryInput[1];
    
    const hasWet = wetInput && wetInput.length >= 2;
    const wetL = hasWet ? wetInput[0] : new Float32Array(dryL.length);
    const wetR = hasWet ? wetInput[1] : new Float32Array(dryR.length);
    
    const outL = output[0];
    const outR = output[1];
    const size = dryL.length;
    
    // O ganho Dry/Wet real será aplicado AQUI, substituindo o antigo GainNode
    const dryGain = 1.0 - this.wetMix;
    const wetGain = this.wetMix;
    
    for (let i = 0; i < size; i++) {
      const dL = dryL[i];
      const dR = dryR[i];
      const wL = wetL[i];
      const wR = wetR[i];
      
      // Mix and write to output
      const finalL = dL * dryGain + wL * wetGain;
      const finalR = dR * dryGain + wR * wetGain;
      outL[i] = finalL;
      outR[i] = finalR;
      
      // -- Telemetry Collection --
      this._sumDryL += dL * dL;
      this._sumDryR += dR * dR;
      this._sumWetL += wL * wL;
      this._sumWetR += wR * wR;
      
      // Mono Compatibility
      const dMid = (dL + dR) * 0.5;
      const wMid = (wL + wR) * 0.5;
      this._sumDryMid += dMid * dMid;
      this._sumWetMid += wMid * wMid;
      
      // ER vs Tail Estimation on Wet signal
      const wetEnergy = wL * wL + wR * wR;
      this._erEnv = 0.95 * this._erEnv + 0.05 * wetEnergy; // Fast follower (~10ms)
      this._tailEnv = 0.999 * this._tailEnv + 0.001 * wetEnergy; // Slow follower (~200ms)
      
      this._sumEr += this._erEnv;
      this._sumTail += this._tailEnv;
    }
    
    this._telemetryCount++;
    if (this._telemetryCount >= 60) {
      const N = 60 * size;
      
      const dryRMS = Math.sqrt((this._sumDryL + this._sumDryR) / (N * 2));
      const wetRMS = Math.sqrt((this._sumWetL + this._sumWetR) / (N * 2));
      
      const erRMS = Math.sqrt(this._sumEr / N);
      const tailRMS = Math.sqrt(this._sumTail / N);
      
      const dryMonoEnergy = Math.sqrt(this._sumDryMid / N) + 1e-12;
      const mixMonoEnergy = Math.sqrt(this._sumDryMid * dryGain * dryGain + this._sumWetMid * wetGain * wetGain) + 1e-12;
      
      // Se a mistura Mono caiu em relação ao Dry Mono original, temos Mono Loss
      const monoLossDb = 20 * Math.log10(mixMonoEnergy / dryMonoEnergy);
      
      this.port.postMessage({
        type: 'telemetry',
        name: 'Room',
        preset: this.preset,
        dryRMS: dryRMS.toFixed(3),
        wetRMS: wetRMS.toFixed(3),
        wetMix: this.wetMix.toFixed(2),
        preDelayMs: this.preDelayMs.toString(),
        rt60: this.rt60.toString() + 's',
        earlyReflections: erRMS.toFixed(3),
        tailRMS: tailRMS.toFixed(3),
        monoLossDb: monoLossDb.toFixed(1)
      });
      
      this._telemetryCount = 0;
      this._sumDryL = 0; this._sumDryR = 0;
      this._sumWetL = 0; this._sumWetR = 0;
      this._sumDryMid = 0;
      this._sumWetMid = 0;
      this._sumEr = 0;
      this._sumTail = 0;
    }
    
    return true;
  }
}

registerProcessor('room-telemetry', RoomTelemetryProcessor);
