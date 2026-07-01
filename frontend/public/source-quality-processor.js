/**
 * Lumina Source Quality Analyzer Processor v1.0
 * Analyzes the original raw audio signal before DSP is applied.
 */
class SourceQualityProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.telemetryEnabled = true;
    this.port.onmessage = (e) => { if (e.data && e.data.type === 'setTelemetryEnabled') { this.telemetryEnabled = !!e.data.enabled; } };
    this.clipCount = 0;
    this.peakSq = 0;
    this.sumSq = 0;
    this.sampleCount = 0;
    this.frames = 0;
    
    // Dynamic Range calculation over 1-second windows
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    this.windowLen = sr;
    this.winPeakSq = 0;
    this.winSumSq = 0;
    this.winCount = 0;
    this.rmsList = [];
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    // Passthrough
    if (input && input[0] && output && output[0]) {
      for (let ch = 0; ch < input.length; ch++) {
        if (output[ch]) output[ch].set(input[ch]);
      }
    }

    if (!input || !input[0]) return true;

    const L = input[0];
    const R = input[1] || input[0];
    const length = L.length;

    let localPeakSq = 0;
    let localSumSq = 0;

    for (let i = 0; i < length; i++) {
      const l = L[i] || 0;
      const r = R[i] || 0;
      
      // Clipping check (> 0.999 or < -0.999)
      if (Math.abs(l) >= 0.999 || Math.abs(r) >= 0.999) {
        this.clipCount++;
      }

      const sqL = l * l;
      const sqR = r * r;
      const ms = (sqL + sqR) * 0.5;
      
      localSumSq += ms;
      if (ms > localPeakSq) localPeakSq = ms;
    }

    this.sumSq += localSumSq;
    this.sampleCount += length;
    if (localPeakSq > this.peakSq) this.peakSq = localPeakSq;

    // Window metrics
    if (localPeakSq > this.winPeakSq) this.winPeakSq = localPeakSq;
    this.winSumSq += localSumSq;
    this.winCount += length;

    if (this.winCount >= this.windowLen) {
      const winRMS = Math.sqrt(this.winSumSq / this.winCount);
      const winRMSDb = winRMS > 1e-6 ? 20 * Math.log10(winRMS) : -100;
      this.rmsList.push(winRMSDb);
      if (this.rmsList.length > 10) this.rmsList.shift(); // Keep last 10 seconds

      this.winPeakSq = 0;
      this.winSumSq = 0;
      this.winCount = 0;
    }

    this.frames += length;

    // Report ~1x per second
    if (this.frames >= 44100) {
      const peakAmp = Math.sqrt(this.peakSq);
      const peakDb = peakAmp > 1e-6 ? 20 * Math.log10(peakAmp) : -100;
      
      const overallRMS = Math.sqrt(this.sumSq / Math.max(1, this.sampleCount));
      const rmsDb = overallRMS > 1e-6 ? 20 * Math.log10(overallRMS) : -100;

      // Dynamic Range = Peak - Average RMS over active segments
      const activeRMS = this.rmsList.filter(r => r > -50);
      const avgRMS = activeRMS.length > 0 ? activeRMS.reduce((a, b) => a + b, 0) / activeRMS.length : rmsDb;
      const dynamicRange = Math.max(0, peakDb - avgRMS);

      let qualityRisk = "EXCELENTE";
      if (this.clipCount > 100) {
        qualityRisk = "HOT_MASTER (CLIPADA)";
      } else if (dynamicRange < 8.0 && peakDb > -1.0) {
        qualityRisk = "HOT_MASTER";
      } else if (peakDb < -12.0) {
        qualityRisk = "VOLUME_BAIXO";
      }

      if (this.telemetryEnabled) this.port.postMessage({ type: 'telemetry',
        name: "SourceQuality",
        peakDb: peakDb.toFixed(1),
        rmsDb: rmsDb.toFixed(1),
        dynamicRangeDb: dynamicRange.toFixed(1),
        sourceClipCount: this.clipCount,
        qualityRisk
      });

      this.frames = 0;
    }

    return true;
  }
}

registerProcessor('source-quality', SourceQualityProcessor);
