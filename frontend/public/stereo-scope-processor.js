class StereoScopeProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.frame = 0;
    this.EPS = 1e-12;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length < 2) return true;

    const L = input[0];
    const R = input[1];

    if (output && output.length >= 2) {
      output[0].set(L);
      output[1].set(R);
    }

    let sumL2 = 0;
    let sumR2 = 0;
    let sumLR = 0;
    let sumMid2 = 0;
    let sumSide2 = 0;

    const points = [];

    for (let i = 0; i < L.length; i++) {
      const l = L[i] || 0;
      const r = R[i] || 0;

      const mid = (l + r) * Math.SQRT1_2;
      const side = (l - r) * Math.SQRT1_2;

      sumL2 += l * l;
      sumR2 += r * r;
      sumLR += l * r;
      sumMid2 += mid * mid;
      sumSide2 += side * side;

      // Extract a few points per frame to not overload main thread
      if (i % 8 === 0) {
        points.push([side, mid]);
      }
    }

    this.frame++;

    if (this.frame % 10 === 0) { // roughly every 1.3ms at 128 buffer / 44100
      const n = L.length;
      const midRMS = Math.sqrt(sumMid2 / n);
      const sideRMS = Math.sqrt(sumSide2 / n);

      const corr = sumLR / Math.sqrt((sumL2 * sumR2) + this.EPS);
      const width = sideRMS / (midRMS + this.EPS);
      const widthDb = 20 * Math.log10(width + this.EPS);

      let phaseRisk = "LOW";
      if (corr < 0.0) phaseRisk = "HIGH";
      else if (corr < 0.5) phaseRisk = "MEDIUM";

      this.port.postMessage({
        type: "telemetry",
        name: "StereoScope",
        corr: corr.toFixed(2),
        midRMSDb: (20 * Math.log10(midRMS + this.EPS)).toFixed(1),
        sideRMSDb: (20 * Math.log10(sideRMS + this.EPS)).toFixed(1),
        widthDb: widthDb.toFixed(1),
        widthPercent: Math.min(200, Math.max(0, width * 100)).toFixed(0),
        phaseRisk,
        monoCompatible: corr > 0.0,
        points // sending array of [side, mid] for canvas rendering
      });
    }

    return true;
  }
}

registerProcessor("stereo-scope-processor", StereoScopeProcessor);
