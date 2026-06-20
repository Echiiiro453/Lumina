class LuminaMasteringProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Parâmetros do Mastering
    this.threshold = 0.891; // -1.0 dBFS (True Peak Audiophile Standard)
    this.envelope = 0;
    this.enablePhaseRotation = false;
    
    // sampleRate está disponível no contexto global do AudioWorklet
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    // Release de 80ms: balanceado e extremamente musical para True Peak Limiting
    this.releaseCoeff = Math.exp(-1.0 / (sr * 0.080));
    
    // Ataque ultra-rápido de 0.1ms para o True Peak Limiter
    this.attackCoeff = Math.exp(-1.0 / (sr * 0.0001));
    
    // Configurações de Look-ahead delay (24 amostras ~ 0.54ms a 44.1kHz)
    this.delayLength = 24;
    const MAX_CH = 8;
    this.delayBuffers = Array.from({ length: MAX_CH }, () => new Float32Array(this.delayLength));
    this.delayWritePtr = 0;
    
    // Buffers de história de 4 amostras para Interpolação Hermite 4x (True Peak detection)
    this.history = Array.from({ length: MAX_CH }, () => new Float32Array(4));
    
    // Phase Rotator: apenas 1 filtro passa-tudo (All-Pass Filter) para não causar smearing audível em música
    this.apfCoeffs = [0.85];
    this.apfStateX = Array.from({ length: MAX_CH }, () => new Float32Array(1));
    this.apfStateY = Array.from({ length: MAX_CH }, () => new Float32Array(1));
    
    this.port.onmessage = (e) => {
      if (e.data.enablePhaseRotation !== undefined) {
        this.enablePhaseRotation = !!e.data.enablePhaseRotation;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    
    const numChannels = input.length;
    const blockSize = input[0].length;
    
    // Array temporário para evitar recriar Float32Array a cada sample
    const blockSamples = new Float32Array(numChannels);
    
    let blockPeakIn = 0;
    let blockPeakOut = 0;
    let blockRmsIn = 0;
    
    for (let i = 0; i < blockSize; ++i) {
      let maxTP = 0;
      
      for (let ch = 0; ch < numChannels; ++ch) {
        let sample = input[ch][i];
        
        const absIn = Math.abs(sample);
        if (absIn > blockPeakIn) blockPeakIn = absIn;
        blockRmsIn += sample * sample;
        
        if (this.enablePhaseRotation) {
          const stateX = this.apfStateX[ch];
          const stateY = this.apfStateY[ch];
          for (let stage = 0; stage < this.apfCoeffs.length; ++stage) {
            const g = this.apfCoeffs[stage];
            const y = -g * sample + stateX[stage] + g * stateY[stage];
            stateX[stage] = sample;
            stateY[stage] = y;
            sample = y;
          }
        }
        
        const absRot = Math.abs(sample);
        if (absRot > blockPeakOut) blockPeakOut = absRot;
        
        blockSamples[ch] = sample;
        
        const hist = this.history[ch];
        // Shift history buffer
        hist[0] = hist[1];
        hist[1] = hist[2];
        hist[2] = hist[3];
        hist[3] = sample;
        
        // Interpolação Hermite 4x
        const y0 = hist[0], y1 = hist[1], y2 = hist[2], y3 = hist[3];
        const a = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
        const b = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
        const c = -0.5 * y0 + 0.5 * y2;
        const d = y1;
        
        let tpCh = Math.abs(y1); // t = 0.0
        
        const v1 = ((a * 0.25 + b) * 0.25 + c) * 0.25 + d;
        const absV1 = Math.abs(v1);
        if (absV1 > tpCh) tpCh = absV1;
        
        const v2 = ((a * 0.5 + b) * 0.5 + c) * 0.5 + d;
        const absV2 = Math.abs(v2);
        if (absV2 > tpCh) tpCh = absV2;
        
        const v3 = ((a * 0.75 + b) * 0.75 + c) * 0.75 + d;
        const absV3 = Math.abs(v3);
        if (absV3 > tpCh) tpCh = absV3;
        
        if (tpCh > maxTP) maxTP = tpCh;
      }
      
      // 2. Envelope Tracker do True Peak (Otimização branchless com CMOV via ternário)
      const isAttack = maxTP > this.envelope;
      const coeff = isAttack ? this.attackCoeff : this.releaseCoeff;
      this.envelope = coeff * this.envelope + (1.0 - coeff) * maxTP;
      
      // 3. Calcular ganho do Limiter baseado no True Peak envelope
      let gain = 1.0;
      if (this.envelope > this.threshold) {
        gain = this.threshold / this.envelope;
      }
      
      // 4. Gravar no delay buffer e ler amostra atrasada com o ganho aplicado
      for (let ch = 0; ch < numChannels; ++ch) {
        const buf = this.delayBuffers[ch];
        const sample = blockSamples[ch];
        
        // Grava no buffer de atraso
        buf[this.delayWritePtr] = sample;
        
        // Lê a amostra atrasada (da cabeça de leitura que está logo atrás)
        const readPtr = (this.delayWritePtr + 1) % this.delayLength;
        let val = buf[readPtr] * gain;
        
        // Soft Clipper (inicia em -1.5dB / 0.841) + Safety Brickwall (-1.0dB / 0.891)
        const softThreshold = 0.841;
        const ceiling = 0.891;
        const absVal = Math.abs(val);
        
        // C-infinity branchless soft-knee clipper
        const diff = absVal - softThreshold;
        // Retificação suave (soft knee)
        const smoothDiff = 0.5 * (diff + Math.sqrt(diff * diff + 1e-4));
        const range = ceiling - softThreshold;
        const valComp = softThreshold + range * Math.tanh(smoothDiff / range);
        
        // Blending contínuo
        const blend = 0.5 * (1.0 + Math.tanh(diff / 0.05));
        
        // Reconstrução livre de branches e auto-limitada
        val = (val / (absVal + 1e-15)) * ((1.0 - blend) * absVal + blend * valComp);
        
        output[ch][i] = val;
      }
      
      this.delayWritePtr = (this.delayWritePtr + 1) % this.delayLength;
    }
    
    if (this.enablePhaseRotation) {
      this._dbgPeakIn = Math.max(this._dbgPeakIn || 0, blockPeakIn);
      this._dbgPeakOut = Math.max(this._dbgPeakOut || 0, blockPeakOut);
      this._dbgRms = (this._dbgRms || 0) + blockRmsIn;
      this._telemetryCount = (this._telemetryCount || 0) + 1;
      
      if (this._telemetryCount >= 60) {
        const samples = 60 * blockSize * numChannels;
        const rms = Math.sqrt(this._dbgRms / samples) + 1e-12;
        
        const crestBefore = this._dbgPeakIn / rms;
        const crestAfter = this._dbgPeakOut / rms;
        
        const peakReductionDb = 20 * Math.log10((this._dbgPeakOut + 1e-12) / (this._dbgPeakIn + 1e-12));
        
        this.port.postMessage({
          type: 'telemetry',
          name: 'PhaseRot',
          crestBefore: crestBefore.toFixed(1),
          crestAfter: crestAfter.toFixed(1),
          peakReduction: peakReductionDb.toFixed(1) + 'dB',
          triggered: true
        });
        
        this._dbgPeakIn = 0;
        this._dbgPeakOut = 0;
        this._dbgRms = 0;
        this._telemetryCount = 0;
      }
    }
    
    return true;
  }
}
registerProcessor('lumina-mastering', LuminaMasteringProcessor);
