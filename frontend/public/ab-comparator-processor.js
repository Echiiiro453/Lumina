class ABComparatorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.blend = 1.0; // 0 = Ref (A), 1 = Processed (B)
    this.mode = 'PROCESSED'; // 'RAW', 'CALIBRATED', 'PROCESSED'
    
    this.frameCount = 0;
    this.sumSquaresA = 0;
    this.sumSquaresB = 0;
    this.sumSquaresDiff = 0;
    
    this.port.onmessage = (e) => {
      if (e.data.blend !== undefined) this.blend = e.data.blend;
      if (e.data.mode !== undefined) this.mode = e.data.mode;
    };
  }

  static get parameterDescriptors() {
    return [];
  }

  process(inputs, outputs, parameters) {
    // inputs[0]: Reference (Calibrated)
    // inputs[1]: Processed (Full DSP Chain)
    // inputs[2]: Raw (Source direct, optional if we route it)
    
    const refInput = inputs[0] || [];
    const procInput = inputs[1] || [];
    const rawInput = inputs[2] || [];
    
    const output = outputs[0];
    
    // Fallback to empty channels if disconnected
    const channels = Math.max(refInput.length, procInput.length, output.length, 1);
    
    for (let c = 0; c < output.length; c++) {
      const refChannel = refInput[c] || new Float32Array(output[c].length);
      const procChannel = procInput[c] || new Float32Array(output[c].length);
      const rawChannel = rawInput[c] || new Float32Array(output[c].length);
      const outChannel = output[c];
      
      const blend = this.blend;
      const gainA = Math.cos(blend * Math.PI * 0.5);
      const gainB = Math.sin(blend * Math.PI * 0.5);
      
      for (let i = 0; i < outChannel.length; i++) {
        const refSample = refChannel[i];
        const procSample = procChannel[i];
        const rawSample = rawChannel[i];
        
        let outSample = 0;
        
        if (this.mode === 'RAW') {
          outSample = rawSample;
        } else if (this.mode === 'CALIBRATED') {
          outSample = refSample;
        } else {
          outSample = (refSample * gainA) + (procSample * gainB);
        }
        
        outChannel[i] = outSample;
        
        // Metering
        if (c === 0) { // For simplicity, calculate RMS on Left channel only or sum? Let's just do Left.
           this.sumSquaresA += refSample * refSample;
           this.sumSquaresB += procSample * procSample;
           const diff = procSample - refSample;
           this.sumSquaresDiff += diff * diff;
           this.frameCount++;
        }
      }
    }
    
    // Telemetry every ~500ms (at 48000Hz, 500ms is 24000 frames)
    if (this.frameCount >= 24000) {
       const rmsA = Math.sqrt(this.sumSquaresA / this.frameCount);
       const rmsB = Math.sqrt(this.sumSquaresB / this.frameCount);
       const rmsDiff = Math.sqrt(this.sumSquaresDiff / this.frameCount);
       
       this.port.postMessage({
          type: 'telemetry',
          refRMS: rmsA,
          procRMS: rmsB,
          diffRMS: rmsDiff
       });
       
       this.frameCount = 0;
       this.sumSquaresA = 0;
       this.sumSquaresB = 0;
       this.sumSquaresDiff = 0;
    }
    
    return true;
  }
}

registerProcessor('ab-comparator-processor', ABComparatorProcessor);
