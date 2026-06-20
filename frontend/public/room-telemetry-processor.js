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
    this.active = true;

    this._frames = 0;
    
    // Telemetry Accumulators
    this._drySq = 0;
    this._wetSq = 0;
    this._mixSq = 0;
    
    // Mono Loss Accumulators
    this._sumDryMid = 0;
    this._sumWetMid = 0;
    this._sumMixMid = 0;
    
    // ER vs Tail estimation (Envelope followers)
    this._erEnv = 0.0;
    this._tailEnv = 0.0;
    this._sumEr = 0.0;
    this._sumTail = 0.0;

    function toFiniteNumber(v, fallback = 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    }

    this.port.onmessage = (e) => {
      const d = e.data || {};
      if (d.preset !== undefined) this.preset = d.preset;
      if (d.preDelayMs !== undefined) this.preDelayMs = toFiniteNumber(d.preDelayMs, this.preDelayMs);
      if (d.rt60 !== undefined) this.rt60 = toFiniteNumber(d.rt60, this.rt60);
      if (d.wetMix !== undefined) this.wetMix = Math.min(1, Math.max(0, toFiniteNumber(d.wetMix, this.wetMix)));
      if (d.active !== undefined) this.active = !!d.active;
    };
  }

  _getChannel(input, ch) {
    if (!input || input.length === 0) return null;
    // canal exato
    if (input[ch] && input[ch].length) return input[ch];
    // fallback mono -> stereo
    if (input[0] && input[0].length) return input[0];
    return null;
  }

  process(inputs, outputs) {
    const output = outputs[0];

    if (!output || output.length === 0) {
      return true;
    }

    const dry = inputs[0];
    const wet = inputs[1];

    const wetMix = Number.isFinite(this.wetMix) ? Math.min(1, Math.max(0, this.wetMix)) : 0.0;
    const dryGain = this.active ? (1.0 - wetMix) : 1.0;
    const wetGain = this.active ? wetMix : 0.0;

    let frameCount = 0;
    let drySq = 0;
    let wetSq = 0;
    let mixSq = 0;
    
    let sumDryMid = 0;
    let sumWetMid = 0;
    let sumMixMid = 0;
    
    let sumEr = 0;
    let sumTail = 0;
    
    const size = output[0].length;
    
    for (let i = 0; i < size; i++) {
      let dL = 0.0, dR = 0.0;
      let wL = 0.0, wR = 0.0;
      let yL = 0.0, yR = 0.0;
      
      for (let ch = 0; ch < output.length; ch++) {
        const out = output[ch];
        const dryCh = this._getChannel(dry, ch);
        const wetCh = this._getChannel(wet, ch);

        const d = dryCh ? dryCh[i] : 0.0;
        const w = wetCh ? wetCh[i] : 0.0;

        let y;
        if (!this.active) {
          y = d;
        } else {
          y = d * dryGain + w * wetGain;
        }
        if (!Number.isFinite(y)) y = 0.0;

        out[i] = y;

        drySq += d * d;
        wetSq += w * w;
        mixSq += y * y;
        
        if (ch === 0) { dL = d; wL = w; yL = y; }
        if (ch === 1) { dR = d; wR = w; yR = y; }
      }
      
      // Mono Compatibility processing
      const dMid = (dL + dR) * 0.5;
      const wMid = (wL + wR) * 0.5;
      const yMid = (yL + yR) * 0.5;
      
      sumDryMid += dMid * dMid;
      sumWetMid += wMid * wMid;
      sumMixMid += yMid * yMid;
      
      // ER vs Tail Estimation on Wet signal
      const wetEnergy = wL * wL + wR * wR;
      this._erEnv = 0.95 * this._erEnv + 0.05 * wetEnergy; // Fast follower (~10ms)
      this._tailEnv = 0.999 * this._tailEnv + 0.001 * wetEnergy; // Slow follower (~200ms)
      
      sumEr += this._erEnv;
      sumTail += this._tailEnv;
      
      frameCount++;
    }

    this._frames += frameCount;
    this._drySq += drySq;
    this._wetSq += wetSq;
    this._mixSq += mixSq;
    
    this._sumDryMid += sumDryMid;
    this._sumWetMid += sumWetMid;
    this._sumMixMid += sumMixMid;
    this._sumEr += sumEr;
    this._sumTail += sumTail;

    if (this._frames >= (typeof sampleRate !== 'undefined' ? sampleRate : 44100) * 0.5) {
      const nTotal = this._frames || 1;
      // Because we accumulate over channels (left+right), for RMS we divide by total frames * channels
      const channels = output.length || 2;
      const nCh = nTotal * channels;

      const dryRMS = Math.sqrt(this._drySq / nCh);
      const wetRMS = Math.sqrt(this._wetSq / nCh);
      
      const erRMS = Math.sqrt(this._sumEr / nTotal);
      const tailRMS = Math.sqrt(this._sumTail / nTotal);

      const dryMonoEnergy = Math.sqrt(this._sumDryMid / nTotal) + 1e-12;
      const mixMonoEnergy = Math.sqrt(this._sumMixMid / nTotal) + 1e-12;
      
      const monoLossDb = 20 * Math.log10(mixMonoEnergy / dryMonoEnergy);

      this.port.postMessage({
        type: "telemetry",
        name: "Room",
        preset: this.preset,
        preDelayMs: Number(this.preDelayMs).toString(),
        rt60: Number(this.rt60).toString() + "s",
        wetMix: wetMix.toFixed(2),
        dryRMS: dryRMS.toFixed(3),
        wetRMS: wetRMS.toFixed(3),
        earlyReflections: erRMS.toFixed(3),
        tailRMS: tailRMS.toFixed(3),
        monoLossDb: monoLossDb.toFixed(1)
      });

      this._frames = 0;
      this._drySq = 0;
      this._wetSq = 0;
      this._mixSq = 0;
      this._sumDryMid = 0;
      this._sumWetMid = 0;
      this._sumMixMid = 0;
      this._sumEr = 0;
      this._sumTail = 0;
    }

    return true;
  }
}

registerProcessor("room-telemetry", RoomTelemetryProcessor);
