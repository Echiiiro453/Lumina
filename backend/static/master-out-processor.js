class MasterOutProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = Math.pow(10, -1.0 / 20); // ~0.891
    this.peakSq = 0;
    this.clipCount = 0;
    this.frames = 0;
    this.sampleRate = 44100; // Será injetado, mas usamos padrão
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0) return true;
    
    let localPeakSq = 0;

    for (let channel = 0; channel < input.length; channel++) {
      const inData = input[channel];
      const outData = output[channel] || new Float32Array(inData.length);
      
      for (let i = 0; i < inData.length; i++) {
        let sample = inData[i];
        
        // Hard Clip (Peak Guard Airbag)
        if (sample > this.ceiling) {
          sample = this.ceiling;
          this.clipCount++;
        } else if (sample < -this.ceiling) {
          sample = -this.ceiling;
          this.clipCount++;
        }
        
        outData[i] = sample;
        
        const sq = sample * sample;
        if (sq > localPeakSq) {
          localPeakSq = sq;
        }
      }
    }

    if (localPeakSq > this.peakSq) {
      this.peakSq = localPeakSq;
    }

    this.frames += input[0].length;
    
    // Envia telemetria ~2x por segundo
    if (this.frames >= 44100 * 0.5) {
      const peakAmp = Math.sqrt(this.peakSq);
      const peakDb = peakAmp > 1e-6 ? 20 * Math.log10(peakAmp) : -100;
      
      this.port.postMessage({
        type: "telemetry",
        name: "MasterOut",
        peakDb: peakDb.toFixed(1),
        clipCount: this.clipCount
      });
      
      this.frames = 0;
      this.peakSq = 0;
      this.clipCount = 0;
    }

    return true;
  }
}

registerProcessor('master-out', MasterOutProcessor);
