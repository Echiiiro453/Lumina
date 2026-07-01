class StereoScopeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.telemetryEnabled = true;
    this.frame = 0;
    this.EPS = 1e-12;
    this.sideGain = 1.0;

    this.phaseRescueEnabled = false;
    this.rescueActive = false;
    this.antiPhaseCounter = 0;

    // Handler ÚNICO: o handler de setTelemetryEnabled antes ficava inalcançável porque
    // uma segunda atribuição a port.onmessage logo abaixo o sobrescrevia.
    this.port.onmessage = ({ data }) => {
      if (!data) return;
      if (data.type === 'setTelemetryEnabled') {
        this.telemetryEnabled = !!data.enabled;
        return;
      }
      if (data.phaseRescue !== undefined) {
        this.phaseRescueEnabled = !!data.phaseRescue;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length < 2) return true;

    const L = input[0];
    const R = input[1];

    let sumL2 = 0;
    let sumR2 = 0;
    let sumLR = 0;
    let sumMid2 = 0;
    let sumSide2 = 0;

    const points = [];

    // Calculate metrics first to update governor
    for (let i = 0; i < L.length; i++) {
      const l = L[i] || 0;
      const r = R[i] || 0;
      sumL2 += l * l;
      sumR2 += r * r;
      sumLR += l * r;
    }

    const blockCorr = sumLR / Math.sqrt((sumL2 * sumR2) + this.EPS);
    const blockMidRMS = Math.sqrt(sumL2 + sumR2 + 2*sumLR); // Simplified
    const blockSideRMS = Math.sqrt(sumL2 + sumR2 - 2*sumLR);
    const blockWidth = blockSideRMS / (blockMidRMS + this.EPS);

    // Stereo Governor Logic
    let stereoTrimTarget = 1.0;
    const widthPercentVal = Math.min(200, Math.max(0, blockWidth * 100));
    if (blockCorr < 0.15 && widthPercentVal > 90) {
      stereoTrimTarget = 0.92;
    } else if (blockCorr < 0.0 || widthPercentVal > 120) {
      stereoTrimTarget = 0.75;
    }

    // Phase Rescue Logic
    if (this.phaseRescueEnabled) {
      if (blockCorr < -0.85 && blockSideRMS > blockMidRMS * 3.0) {
        this.antiPhaseCounter++;
        // ~100 blocks = ~270ms latency at 128 buffer size / 48kHz
        if (this.antiPhaseCounter > 100) {
          this.rescueActive = true;
        }
      } else {
        if (blockCorr > 0.0) {
          this.antiPhaseCounter = Math.max(0, this.antiPhaseCounter - 2);
          if (this.antiPhaseCounter === 0) {
            this.rescueActive = false;
          }
        }
      }
    } else {
      this.rescueActive = false;
      this.antiPhaseCounter = 0;
    }

    let postSumL2 = 0;
    let postSumR2 = 0;
    let postSumLR = 0;

    for (let i = 0; i < L.length; i++) {
      this.sideGain += (stereoTrimTarget - this.sideGain) * 0.01; // Smooth transition
      
      const l = L[i] || 0;
      let r = R[i] || 0;

      if (this.rescueActive) {
        r = -r;
      }

      const mid = (l + r) * Math.SQRT1_2;
      let side = (l - r) * Math.SQRT1_2;
      
      // Apply Governor
      side *= this.sideGain;

      let outL = (mid + side) * Math.SQRT1_2;
      let outR = (mid - side) * Math.SQRT1_2;

      // Reconstruct
      if (output && output.length >= 2) {
        output[0][i] = outL;
        output[1][i] = outR;
      }

      sumMid2 += mid * mid;
      sumSide2 += side * side;
      postSumL2 += outL * outL;
      postSumR2 += outR * outR;
      postSumLR += outL * outR;

      if (i % 8 === 0) points.push([side, mid]);
    }

    this.frame++;

    if (this.frame % 10 === 0) {
      const n = L.length;
      const midRMS = Math.sqrt(sumMid2 / n);
      const sideRMS = Math.sqrt(sumSide2 / n);

      // Use POST-governor correlation for accurate telemetry
      const corr = postSumLR / Math.sqrt((postSumL2 * postSumR2) + this.EPS);
      const width = sideRMS / (midRMS + this.EPS);
      const widthDb = 20 * Math.log10(width + this.EPS);

      let phaseRisk = "LOW";
      if (corr < 0.0) phaseRisk = "HIGH";
      else if (corr < 0.5) phaseRisk = "MEDIUM";

      if (this.telemetryEnabled) this.port.postMessage({ type: 'telemetry',
        name: "StereoScope",
        corr: corr.toFixed(2),
        midRMSDb: (20 * Math.log10(midRMS + this.EPS)).toFixed(1),
        sideRMSDb: (20 * Math.log10(sideRMS + this.EPS)).toFixed(1),
        widthDb: widthDb.toFixed(1),
        widthPercent: Math.min(200, Math.max(0, width * 100)).toFixed(0),
        phaseRisk,
        monoCompatible: corr > 0.0,
        sideGain: this.sideGain,
        governorActive: this.sideGain < 0.99,
        points // sending array of [side, mid] for canvas rendering
      });
    }

    return true;
  }
}

registerProcessor("stereo-scope-processor", StereoScopeProcessor);
