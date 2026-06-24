const getWallClockMs = () => {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
};

class MasterOutProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ceiling = Math.pow(10, -1.0 / 20); // ~0.891
    this.peakSq = 0;
    this.prePeakSq = 0;
    this.truePeakSq = 0;
    this.clipCount = 0;
    this.frames = 0;
    this.sampleRate = 44100; // Will be injected or default
    this.truePeakMode = 2; // Default 2x oversampling
    this.prevSamples = new Float32Array(8); // past samples per channel
    this.cpuTimeSum = 0;
    this.cpuCount = 0;
    this.underruns = 0;
    this.underrunEvents = [];
    this.isPlaying = false;
    this.lastProcessTime = 0;
    this.lastProcessWallTime = 0;
    this.avgCpuMs = 0;
    this.triggerError = false;
    this.safeBypassActive = false;
    this.lastErrorMs = 0;

    this.port.onmessage = (e) => {
      if (e.data.truePeakMode !== undefined) {
        this.truePeakMode = e.data.truePeakMode;
      }
      if (e.data.triggerError) {
        this.triggerError = true;
      }
      if (e.data.type === "state") {
        if (e.data.isPlaying !== undefined) {
          this.isPlaying = e.data.isPlaying;
        }
        this.lastProcessWallTime = 0;
      }
      if (e.data.type === "reset") {
        this.underruns = 0;
        this.underrunEvents = [];
        this.lastProcessWallTime = 0;
      }
      if (e.data.type === "resetClips") {
        this.clipCount = 0;
        this.peakSq = 0;
        this.prePeakSq = 0;
        this.truePeakSq = 0;
        this.prevSamples.fill(0);
      }
    };
  }

  process(inputs, outputs) {
    try {
      if (this.triggerError) {
        throw new Error("Forced DSP Error for Crash Guard testing");
      }

      if (this.safeBypassActive) {
        this.safeBypassActive = false;
        this.port.postMessage({
          type: "status",
          name: "MasterOut",
          status: "RECOVERED",
          safeBypassActive: false
        });
      }

      const startMs = getWallClockMs();
      
      const input = inputs[0];
      const output = outputs[0];

      // Check if input has signal (non-silent)
      let hasSignal = false;
      if (input && input.length > 0) {
        for (let channel = 0; channel < input.length; channel++) {
          const inData = input[channel];
          if (inData) {
            for (let i = 0; i < inData.length; i++) {
              if (Math.abs(inData[i]) > 1e-4) {
                hasSignal = true;
                break;
              }
            }
          }
          if (hasSignal) break;
        }
      }

      // Underrun detection with budget tolerance (4x block budget = ~11.6ms at 44.1kHz)
      const blockBudgetMs = (128 / (this.sampleRate || 44100)) * 1000;
      if (this.lastProcessWallTime) {
        const elapsedReal = startMs - this.lastProcessWallTime;
        if (this.isPlaying && hasSignal && elapsedReal > blockBudgetMs * 4) {
          this.underruns++;
          this.underrunEvents.push(startMs);
        }
      }
      this.lastProcessWallTime = startMs;

      // Keep only events from the last 10 seconds
      const tenSecAgo = startMs - 10000;
      this.underrunEvents = this.underrunEvents.filter(t => t > tenSecAgo);
      const recentUnderruns = this.underrunEvents.length;

      if (!input || input.length === 0) {
        const elapsedMs = getWallClockMs() - startMs;
        this.avgCpuMs = this.avgCpuMs * 0.95 + elapsedMs * 0.05;
        return true;
      }
      
      let localPeakSq = 0;
      let localTruePeakSq = 0;

      for (let channel = 0; channel < input.length; channel++) {
        const inData = input[channel];
        const outData = output[channel] || new Float32Array(inData.length);
        
        for (let i = 0; i < inData.length; i++) {
          const inSq = inData[i] * inData[i];
          if (inSq > this.prePeakSq) this.prePeakSq = inSq;
          
          let sample = inData[i] || 0;
          
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

          // True Peak oversampling
          let tpSq = sq;
          const prev = this.prevSamples[channel] || 0;
          if (this.truePeakMode === 2) {
            const interp = 0.5 * (prev + sample);
            const interpSq = interp * interp;
            if (interpSq > tpSq) tpSq = interpSq;
          } else if (this.truePeakMode === 4) {
            const interp1 = 0.75 * prev + 0.25 * sample;
            const interp2 = 0.5 * prev + 0.5 * sample;
            const interp3 = 0.25 * prev + 0.75 * sample;
            const sq1 = interp1 * interp1;
            const sq2 = interp2 * interp2;
            const sq3 = interp3 * interp3;
            tpSq = Math.max(tpSq, sq1, sq2, sq3);
          }
          this.prevSamples[channel] = sample;

          if (tpSq > localTruePeakSq) {
            localTruePeakSq = tpSq;
          }
        }
      }

      if (localPeakSq > this.peakSq) {
        this.peakSq = localPeakSq;
      }
      if (localTruePeakSq > this.truePeakSq) {
        this.truePeakSq = localTruePeakSq;
      }

      this.frames += input[0].length;
      
      // CPU load accounting
      const elapsedMs = getWallClockMs() - startMs;
      this.avgCpuMs = this.avgCpuMs * 0.95 + elapsedMs * 0.05;
      
      // Envia telemetria ~2x por segundo
      if (this.frames >= 44100 * 0.5) {
        const peakAmp = Math.sqrt(this.peakSq);
        const prePeakAmp = Math.sqrt(this.prePeakSq);
        const peakDb = peakAmp > 1e-6 ? 20 * Math.log10(peakAmp) : -100;
        const prePeakDb = prePeakAmp > 1e-6 ? 20 * Math.log10(prePeakAmp) : -100;
        
        const truePeakAmp = Math.sqrt(this.truePeakSq);
        const truePeakDb = truePeakAmp > 1e-6 ? 20 * Math.log10(truePeakAmp) : -100;
        
        const cpuLoad = Math.min(100, (this.avgCpuMs / blockBudgetMs) * 100);

        let interSampleRisk = "LOW";
        const diff = truePeakDb - peakDb;
        if (diff > 0.8 && truePeakDb > -1.0) {
          interSampleRisk = "HIGH";
        } else if (diff > 0.3) {
          interSampleRisk = "MEDIUM";
        }
        
        const performanceSupported = (typeof performance !== "undefined" && typeof performance.now === "function");
        const cpuTimingQuality = performanceSupported ? "HIGH RES" : "LOW RES";

        this.port.postMessage({
          type: "telemetry",
          name: "MasterOut",
          peakDb: peakDb.toFixed(1),
          peakPreMasterDb: prePeakDb.toFixed(1),
          clipCount: this.clipCount,
          truePeakDb: truePeakDb.toFixed(1),
          interSampleRisk,
          cpuLoad: cpuLoad.toFixed(1),
          avgCpuMs: this.avgCpuMs.toFixed(3),
          underruns: this.underruns,
          recentUnderruns,
          cpuTimingQuality,
          truePeakMode: this.truePeakMode
        });
        
        this.frames = 0;
        this.peakSq = 0;
        this.prePeakSq = 0;
        this.truePeakSq = 0;
        this.clipCount = 0;
      }
    } catch (err) {
      const input = inputs[0];
      const output = outputs[0];

      if (input && output) {
        for (let ch = 0; ch < Math.min(input.length, output.length); ch++) {
          if (input[ch] && output[ch]) {
            output[ch].set(input[ch]);
          }
        }
      }

      this.safeBypassActive = true;
      const nowMs = getWallClockMs();
      if (!this.lastErrorMs || nowMs - this.lastErrorMs > 1000) {
        this.port.postMessage({
          type: "error",
          name: "MasterOut",
          safeBypassActive: true,
          message: String(err)
        });
        this.lastErrorMs = nowMs;
      }
    }

    return true;
  }
}

registerProcessor('master-out', MasterOutProcessor);
