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
    this._sumMixMid = 0;
    
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
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    
    for (let c = 0; c < Math.min(input.length, output.length); c++) {
      output[c].set(input[c]);
    }
    
    return true;
  }
}

registerProcessor('room-telemetry', RoomTelemetryProcessor);
