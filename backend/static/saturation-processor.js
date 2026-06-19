/**
 * Lumina Harmonic Saturation Processor v9.3
 * Three analogue-modelled saturation modes with Second-Order ADAA (Anti-Derivative Anti-Aliasing).
 * Featuring:
 *   - Unified Global Analytical F2(x): Replaces piecewise segments and heptic blending with a single global formula using a minimax Trilogarithm (Li2) approximation.
 *   - Formal State-Space Grid Bias Model: Models the triode grid leak capacitor charge/discharge dynamics as a continuous state-space equation.
 *   - Memory Curvature Coupling: Modulates bias feedback via signal velocity to emulate organic tape/tube micro-instability.
 *   - Continuous Bias Decay Blending: Replaces discrete gating with an infinitely differentiable decay transition.
 *   - Perfect Dry Null: Passes original safeguarded signal in the dry path for perfect wet/dry nulling.
 *   - Soft Input Bounding: Replaces hard clamping with an infinitely differentiable tanh soft-clipping ceiling.
 *   - Differentiable Smooth Threshold Limits: Replaces non-differentiable min() with smoothLimit() to preserve fine textures.
 *   - Scale-Normalized Adaptive Thresholds: Dimensionally balanced limits for velocity and acceleration.
 *   - Dynamic Error Observer: Evaluates local numerical stability to gate ADAA order.
 *   - Ultra-slow Energy Conservation Loop: 2.2s time constant loudness-invariant auto-gain.
 */
class SaturationProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.mode  = 'tube';
    this.drive = 0.3;  // 0–1
    this.mix   = 0.25; // wet/dry 0–1

    this.prevX = null;     // Stored per-channel history: Float32Array(2) per channel: [x(n-1), x(n-2)]
    this.rmsIn = null;     // Short-term RMS energy tracking for input
    this.rmsOut = null;    // Short-term RMS energy tracking for output
    this.biasState = null; // Stored per-channel bias shift states for physical triode/tape feedback

    this.recalcCoefficients();

    this.port.onmessage = ({ data }) => {
      let changed = false;
      if (data.mode  !== undefined) this.mode  = data.mode;
      if (data.drive !== undefined) {
        this.drive = data.drive;
        changed = true;
      }
      if (data.mix   !== undefined) this.mix   = data.mix;

      if (changed) {
        this.recalcCoefficients();
      }
    };
  }

  recalcCoefficients() {
    const d = this.drive;
    this.kTube = 1 + d * 10;
    this.tanhKTube = Math.tanh(this.kTube);

    this.kTape = 1 + d * 6;
    this.tanhKTape = Math.tanh(this.kTape);
    this.tapeBias = 0.06 * d;

    this.kTransPos = 1 + d * 5;
    this.tanhKTransPos = Math.tanh(this.kTransPos);

    this.kTransNeg = 1 + d * 9;
    this.tanhKTransNeg = Math.tanh(this.kTransNeg);
  }

  // Safe Log-Cosh function to prevent double precision float overflows
  _logCosh(x) {
    const absX = Math.abs(x);
    if (absX > 20) {
      return absX - 0.6931471805599453; // log(2)
    }
    return Math.log(Math.cosh(x));
  }

  // --- Second Antiderivative of log(cosh(x)) ---
  // Unified global analytical formulation:
  // F2(x) = sign(x) * [ 0.5 * x^2 - log(2) * |x| - 0.5 * Li2(-exp(-2*|x|)) - pi^2/24 ]
  // Using a 7-term minimax polynomial to approximate Li2(z) on the interval [-1, 0].
  _F2(x) {
    const absX = Math.abs(x);
    const sign = x < 0 ? -1 : 1;

    // Evaluate z = -exp(-2.0 * absX)
    const z = -Math.exp(-2.0 * absX);

    // 7-term Minimax polynomial approximation for Li2(z) on [-1, 0]
    // Achieves absolute maximum error < 1.05e-5 and matches exact value at z = -1 (-pi^2/12)
    const li2 = z * (1.000181523960820 + z * (0.250836606484860 + z * (0.111416554484931 + z * (0.061385087399737 + z * (0.041088660969982 + z * (0.026927280916608 + z * 0.008929268809586))))));

    return sign * (0.5 * absX * absX - 0.6931471805599453 * absX - 0.5 * li2 - 0.4112335167120563);
  }

  // --- Tube Model & Antiderivatives ---
  _tube(x) {
    return Math.tanh(x * this.kTube) / this.tanhKTube;
  }
  _F_tube(x) {
    return this._logCosh(x * this.kTube) / (this.kTube * this.tanhKTube);
  }
  _F2_tube(x) {
    return this._F2(x * this.kTube) / (this.kTube * this.kTube * this.tanhKTube);
  }

  // --- Tape Model & Antiderivatives ---
  _tape(x) {
    const y = Math.tanh(x * this.kTape) / this.tanhKTape;
    return y - this.tapeBias * y * y;
  }
  _F_tape(x) {
    const u = x * this.kTape;
    const term1 = this._logCosh(u) / (this.kTape * this.tanhKTape);
    const term2 = this.tapeBias * (u - Math.tanh(u)) / (this.kTape * this.tanhKTape * this.tanhKTape);
    return term1 - term2;
  }
  _F2_tape(x) {
    const u = x * this.kTape;
    const term1 = this._F2(u) / (this.kTape * this.kTape * this.tanhKTape);
    const term2 = this.tapeBias * (0.5 * u * u - this._logCosh(u)) / (this.kTape * this.kTape * this.tanhKTape * this.tanhKTape);
    return term1 - term2;
  }

  // --- Transformer Model & Antiderivatives ---
  _transformer(x) {
    if (x >= 0) return Math.tanh(x * this.kTransPos) / this.tanhKTransPos;
    return Math.tanh(x * this.kTransNeg) / this.tanhKTransNeg;
  }
  _F_transformer(x) {
    if (x >= 0) return this._logCosh(x * this.kTransPos) / (this.kTransPos * this.tanhKTransPos);
    return this._logCosh(x * this.kTransNeg) / (this.kTransNeg * this.tanhKTransNeg);
  }
  _F2_transformer(x) {
    if (x >= 0) return this._F2(x * this.kTransPos) / (this.kTransPos * this.kTransPos * this.tanhKTransPos);
    return this._F2(x * this.kTransNeg) / (this.kTransNeg * this.kTransNeg * this.tanhKTransNeg);
  }

  // Helpers to evaluate current mode's functions dynamically
  _f_mode(x) {
    if (this.mode === 'tape') return this._tape(x);
    if (this.mode === 'transformer') return this._transformer(x);
    return this._tube(x);
  }
  _F1_mode(x) {
    if (this.mode === 'tape') return this._F_tape(x);
    if (this.mode === 'transformer') return this._transformer(x);
    return this._F_tube(x);
  }
  _F2_mode(x) {
    if (this.mode === 'tape') return this._F2_tape(x);
    if (this.mode === 'transformer') return this._F2_transformer(x);
    return this._F2_tube(x);
  }

  // Helper for computing smooth 1st-order differences of F2 with Dynamic Error Observer gating
  _smoothDiffF2(xa, xb, F2_a, F2_b, F1_mid, eps) {
    const d = xa - xb;
    const absD = Math.abs(d);
    
    // Gating parameter: computes the normalized error of the division operation
    const u = Math.min(1.0, absD / eps);
    const w = u * u * (3 - 2 * u);
    
    const term1 = (u >= 1.0) ? (F2_a - F2_b) / d : (d / (eps * eps)) * (3 - 2 * u) * (F2_a - F2_b);
    return term1 + (1 - w) * F1_mid;
  }

  // Infinitely differentiable smooth limiting function to replace non-differentiable min()
  _smoothLimit(val, maxVal) {
    return maxVal * Math.tanh(val / (maxVal + 1e-15));
  }

  process(inputs, outputs) {
    const input = inputs[0], output = outputs[0];
    if (!input || !input[0]) return true;

    const wet = this.mix, dry = 1 - wet;
    const chs = input.length;

    // Lazy initialization of state variables
    if (!this.prevX || this.prevX.length < chs) {
      this.prevX = Array.from({ length: chs }, () => new Float32Array(2));
      this.rmsIn = new Float32Array(chs);
      this.rmsOut = new Float32Array(chs);
      this.biasState = new Float32Array(chs);
      // Multi-domain magnetization states (5 domains)
      this.magState1 = new Float32Array(chs);
      this.magState2 = new Float32Array(chs);
      this.magState3 = new Float32Array(chs);
      this.magState4 = new Float32Array(chs);
      this.magState5 = new Float32Array(chs);
      this.lfNoiseState = new Float32Array(chs);    // LF noise filter state
      this.prevH = new Float32Array(chs);          // Previous field H(n-1)
      // Pink noise filter states
      this.pinkB0 = new Float32Array(chs);
      this.pinkB1 = new Float32Array(chs);
      this.pinkB2 = new Float32Array(chs);
      
      this.dcBlockX = new Float32Array(chs);
      this.dcBlockY = new Float32Array(chs);
      this.fastRmsIn = new Float32Array(chs);
    }

    const rmsCoeff = 0.99999;  // Slow integration constant (tau ~ 2.2s)
    const biasCoeff = 0.9997; // Time constant ~ 80ms for grid bias shift recovery

    for (let ch = 0; ch < chs; ch++) {
      const inCh = input[ch], outCh = output[ch];
      if (!outCh) continue;
      
      const chHist = this.prevX[ch];
      let x1 = chHist[0]; // x(n-1)
      let x2 = chHist[1]; // x(n-2)

      // Guard history buffer states against NaN/Infinity
      if (isNaN(x1) || !isFinite(x1)) x1 = 0.0;
      if (isNaN(x2) || !isFinite(x2)) x2 = 0.0;

      for (let i = 0; i < inCh.length; i++) {
        const xOrig = inCh[i];
        
        // Safeguard original input for clean dry mix path
        const xOrigSafe = (isNaN(xOrig) || !isFinite(xOrig)) ? 0.0 : xOrig;
        let x = xOrigSafe;

        // Fast RMS for instant noise gating (tau ~ 2ms)
        this.fastRmsIn[ch] = this.fastRmsIn[ch] * 0.99 + (xOrigSafe * xOrigSafe) * 0.01;

        // --- Denormal Protection & Silence Flush Gate ---
        if (Math.abs(x) < 1e-7 && this.rmsIn[ch] < 1e-6) {
          this.magState1[ch] = 0.0;
          this.magState2[ch] = 0.0;
          this.magState3[ch] = 0.0;
          this.magState4[ch] = 0.0;
          this.magState5[ch] = 0.0;
          this.prevH[ch] = 0.0;
          this.biasState[ch] = 0.0;
          this.lfNoiseState[ch] = 0.0;
          this.rmsOut[ch] *= 0.9;
          outCh[i] = 0.0;
          continue; 
        }

        // Differentiable Soft Input Bounding (Ceiling of 10.0)
        x = 10.0 * Math.tanh(x / 10.0);

        // 2. Formal State-Space Grid Bias Capacitor Model
        const biasStrength = 0.15 * this.drive;
        let biasVal = this.biasState[ch];
        if (isNaN(biasVal) || !isFinite(biasVal)) biasVal = 0.0;

        // Grid-to-cathode voltage
        const vgk = x - biasVal;
        // Smooth grid diode rectification model (infinitely differentiable)
        const chargeCurrent = 0.5 * vgk * (1.0 + Math.tanh(vgk / 0.1));
        const chargeCoeff = 0.02 * this.drive;

        // Continuous Bias Decay Blending
        const currentEnv = Math.abs(xOrigSafe);
        const decayBlend = Math.tanh(currentEnv / 1e-4);
        const adaptiveBiasCoeff = 0.99 + (biasCoeff - 0.99) * decayBlend;

        // State update
        const nextBias = adaptiveBiasCoeff * biasVal + chargeCoeff * chargeCurrent;
        this.biasState[ch] = nextBias;

        // Memory Curvature Coupling
        const deltaX = x - x1;
        const velocityCoupling = 0.2 * Math.tanh(Math.abs(deltaX) / 0.1);
        let xFeed = x - biasStrength * nextBias * (1.0 + velocityCoupling);

        // Physical tape modulation noise (Frequency-shaped & State-dependent)
        if (this.mode === 'tape') {
          let M1 = this.magState1[ch];
          let M2 = this.magState2[ch];
          let M3 = this.magState3[ch];
          let M4 = this.magState4[ch];
          let M5 = this.magState5[ch];
          let H_prev = this.prevH[ch];
          if (isNaN(M1) || !isFinite(M1)) M1 = 0.0;
          if (isNaN(M2) || !isFinite(M2)) M2 = 0.0;
          if (isNaN(M3) || !isFinite(M3)) M3 = 0.0;
          if (isNaN(M4) || !isFinite(M4)) M4 = 0.0;
          if (isNaN(M5) || !isFinite(M5)) M5 = 0.0;
          if (isNaN(H_prev) || !isFinite(H_prev)) H_prev = 0.0;

          const H = xFeed; // Applied magnetic field
          const deltaH = H - H_prev;
          this.prevH[ch] = H;

          // 1. Multi-domain Preisach hysteresis model with Mean-Field Interaction (5 domains)
          const couplingStrength = 0.10;
          const H_eff1 = H + couplingStrength * (M2 + M3 + M4 + M5);
          const H_eff2 = H + couplingStrength * (M1 + M3 + M4 + M5);
          const H_eff3 = H + couplingStrength * (M1 + M2 + M4 + M5);
          const H_eff4 = H + couplingStrength * (M1 + M2 + M3 + M5);
          const H_eff5 = H + couplingStrength * (M1 + M2 + M3 + M4);

          // Domain updates (asymmetric hysteretic rates with Soft-Sign for C1 continuity)
          // Using Math.tanh(deltaH / 0.05) instead of Math.sign(deltaH) eliminates "radio tuning" zipper noise
          const softSign = Math.tanh(deltaH / 0.05);
          
          const rate1 = 0.30 * (1.0 + 0.5 * softSign * Math.tanh(M1 / 0.5));
          const nextM1 = M1 + rate1 * (Math.tanh(H_eff1 * 2.0) - M1);
          const dM1 = nextM1 - M1;
          M1 = nextM1;
          this.magState1[ch] = M1;

          const rate2 = 0.20 * (1.0 + 0.4 * softSign * Math.tanh(M2 / 0.5));
          const nextM2 = M2 + rate2 * (Math.tanh(H_eff2 * 1.3) - M2);
          const dM2 = nextM2 - M2;
          M2 = nextM2;
          this.magState2[ch] = M2;

          const rate3 = 0.12 * (1.0 + 0.3 * softSign * Math.tanh(M3 / 0.5));
          const nextM3 = M3 + rate3 * (Math.tanh(H_eff3 * 0.9) - M3);
          const dM3 = nextM3 - M3;
          M3 = nextM3;
          this.magState3[ch] = M3;

          const rate4 = 0.07 * (1.0 + 0.25 * softSign * Math.tanh(M4 / 0.5));
          const nextM4 = M4 + rate4 * (Math.tanh(H_eff4 * 0.5) - M4);
          const dM4 = nextM4 - M4;
          M4 = nextM4;
          this.magState4[ch] = M4;

          const rate5 = 0.03 * (1.0 + 0.15 * softSign * Math.tanh(M5 / 0.5));
          const nextM5 = M5 + rate5 * (Math.tanh(H_eff5 * 0.2) - M5);
          const dM5 = nextM5 - M5;
          M5 = nextM5;
          this.magState5[ch] = M5;

          // Net magnetization (weighted average)
          const M = 0.12 * M1 + 0.25 * M2 + 0.32 * M3 + 0.20 * M4 + 0.11 * M5;

          // Endogenous Barkhausen Noise from micro-domain state transitions
          const bark1 = dM1 * (Math.random() - 0.5);
          const bark2 = dM2 * (Math.random() - 0.5);
          const bark3 = dM3 * (Math.random() - 0.5);
          const bark4 = dM4 * (Math.random() - 0.5);
          const bark5 = dM5 * (Math.random() - 0.5);
          const rawBarkhausen = 0.12 * bark1 + 0.25 * bark2 + 0.32 * bark3 + 0.20 * bark4 + 0.11 * bark5;
          const barkhausenNoise = 6e-5 * this.drive * rawBarkhausen;

          // 2. Physical tape noise (crossover: LF grain & 1/f Pink HF hiss)
          let lfN = this.lfNoiseState[ch];
          if (isNaN(lfN) || !isFinite(lfN)) lfN = 0.0;

          const rawNoise1 = Math.random() - 0.5;
          const rawNoise2 = Math.random() - 0.5;

          // 1st-order Low-pass filter for LF scrape flutter noise (~150Hz cutoff)
          lfN = 0.98 * lfN + 0.02 * rawNoise1;
          this.lfNoiseState[ch] = lfN;

          // 1/f Pink Noise Filter for HF tape hiss (Paul Kellet's refined approximation)
          let p0 = this.pinkB0[ch];
          let p1 = this.pinkB1[ch];
          let p2 = this.pinkB2[ch];
          if (isNaN(p0) || !isFinite(p0)) p0 = 0.0;
          if (isNaN(p1) || !isFinite(p1)) p1 = 0.0;
          if (isNaN(p2) || !isFinite(p2)) p2 = 0.0;

          p0 = 0.99765 * p0 + rawNoise2 * 0.0990460;
          p1 = 0.96300 * p1 + rawNoise2 * 0.2965164;
          p2 = 0.57000 * p2 + rawNoise2 * 1.0526913;
          this.pinkB0[ch] = p0;
          this.pinkB1[ch] = p1;
          this.pinkB2[ch] = p2;

          const hfN = p0 + p1 + p2 + rawNoise2 * 0.1848;

          // LF scrape noise coupled to velocity of magnetization
          const lfCoupling = Math.tanh(Math.abs(deltaH) / 0.08);
          const lfNoiseLevel = 3e-5 * this.drive * lfCoupling;

          // LF-to-HF spectral cross-coupling (hiss modulated by scrape flutter)
          const crossCoupling = 1.0 + 0.4 * lfN;

          // HF tape hiss coupled to state-space magnetization level and LF modulated
          const hfCoupling = Math.tanh(Math.abs(M) / 0.05) * crossCoupling;
          const hfNoiseLevel = 2e-5 * this.drive * hfCoupling;

          // Gating noise floor by FAST RMS to prevent 2-second AGC amplification during silence
          const noiseGate = Math.tanh(this.fastRmsIn[ch] * 5000.0);
          const tapeNoise = (lfN * lfNoiseLevel + hfN * hfNoiseLevel + barkhausenNoise) * noiseGate;
          
          xFeed = M + tapeNoise;
        }

        // DC Blocker (Simulates Playback Head Inductive Derivative)
        // Eliminates Weiss Coupling Spontaneous Magnetization DC offset
        const dcBlocked = xFeed - this.dcBlockX[ch] + 0.995 * this.dcBlockY[ch];
        this.dcBlockX[ch] = xFeed;
        this.dcBlockY[ch] = dcBlocked;

        const saturated = dcBlocked;
        outCh[i] = saturated * this.mix + xOrigSafe * (1 - this.mix);
        
        // Track RMS of the clean saturated signal (ignoring noise) to prevent bias loop
        const pureOutput = (this.mode === 'tape' && typeof M !== 'undefined') ? (outCh[i] - dcBlocked * this.mix + (M - this.dcBlockX[ch] + 0.995 * this.dcBlockY[ch]) * this.mix) : outCh[i];
        this.rmsOut[ch] = this.rmsOut[ch] * rmsCoeff + (pureOutput * pureOutput) * (1 - rmsCoeff);
        
        const d1 = xFeed - x1;
        const d2 = x1 - x2;
        const d3 = xFeed - x2;

        const absD1 = Math.abs(d1);
        const absD2 = Math.abs(d2);
        const absD3 = Math.abs(d3);
        
        // Acceleration / Curvature parameter
        const absD2x = Math.abs(xFeed - 2 * x1 + x2);

        // Scale-Normalized Adaptive Thresholds with Infinitely Differentiable smoothLimit
        const env = Math.abs(xFeed) + Math.abs(x1) + 1e-15;
        const envPrev = Math.abs(x1) + Math.abs(x2) + 1e-15;
        
        const eps1 = 1e-5 * env + 1e-4 * this._smoothLimit(absD1, env) + 1e-15;
        const eps2 = 1e-5 * envPrev + 1e-4 * this._smoothLimit(absD2, envPrev) + 1e-15;
        const eps3 = 1e-5 * env + 1e-4 * this._smoothLimit(absD3, env) + 1e-4 * this._smoothLimit(absD2x, env) + 1e-15;

        // 3. Pre-evaluate antiderivative levels (Unified F2)
        const F2_x  = this._F2_mode(xFeed);
        const F2_x1 = this._F2_mode(x1);
        const F2_x2 = this._F2_mode(x2);

        const F1_x  = this._F1_mode(xFeed);
        const F1_x1 = this._F1_mode(x1);

        const xMid12 = 0.5 * (xFeed + x1);
        const xMid23 = 0.5 * (x1 + x2);

        const F1_mid12 = this._F1_mode(xMid12);
        const F1_mid23 = this._F1_mode(xMid23);

        // 4. Compute smooth first-order finite differences of F2
        const Y1 = this._smoothDiffF2(xFeed, x1, F2_x, F2_x1, F1_mid12, eps1);
        const Y2 = this._smoothDiffF2(x1, x2, F2_x1, F2_x2, F1_mid23, eps2);

        // 5. Compute smooth ADAA1 fallback path (gates when d1 -> 0)
        const u1 = Math.min(1.0, absD1 / eps1);
        const w1 = u1 * u1 * (3 - 2 * u1);
        const fMid12 = this._f_mode(xMid12);
        const y_ADAA1 = (u1 >= 1.0) ? (F1_x - F1_x1) / d1 : (d1 / (eps1 * eps1)) * (3 - 2 * u1) * (F1_x - F1_x1) + (1 - w1) * fMid12;

        // 6. Compute smooth ADAA2 output path via implicit crossfading (gates when d3 -> 0)
        const u3 = Math.min(1.0, absD3 / eps3);
        const w3 = u3 * u3 * (3 - 2 * u3);
        const sat = (u3 >= 1.0) ? 2.0 * (Y1 - Y2) / d3 : 2.0 * (d3 / (eps3 * eps3)) * (3 - 2 * u3) * (Y1 - Y2) + (1 - w3) * y_ADAA1;

        // 7. Energy Conservation Loop (Loudness-Invariant Auto-Gain to prevent tonal/gain drift)
        let rIn = this.rmsIn[ch];
        let rOut = this.rmsOut[ch];
        if (isNaN(rIn) || !isFinite(rIn)) rIn = 0.0;
        if (isNaN(rOut) || !isFinite(rOut)) rOut = 0.0;

        rIn  = rmsCoeff * rIn  + (1.0 - rmsCoeff) * (x * x);
        rOut = rmsCoeff * rOut + (1.0 - rmsCoeff) * (sat * sat);
        
        this.rmsIn[ch] = rIn;
        this.rmsOut[ch] = rOut;

        const gainComp = Math.sqrt((rIn + 1e-5) / (rOut + 1e-5));
        const safeGain = Math.max(0.25, Math.min(2.5, gainComp));
        const satCompensated = sat * safeGain;

        outCh[i] = dry * xOrigSafe + wet * satCompensated;
        x2 = x1;
        x1 = xFeed;
      }
      chHist[0] = x1;
      chHist[1] = x2;
    }
    return true;
  }
}
registerProcessor('saturation', SaturationProcessor);
