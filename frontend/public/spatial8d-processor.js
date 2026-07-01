/**
 * Lumina Spatial 8D Processor (Base Binaural)
 * 
 * Implementação de Áudio Espacial Binaural Estático com controle cirúrgico
 * de Center Drift, perdas de Mono e telemetria profunda de correlação.
 */

class Spatial8DProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'wet', defaultValue: 0.20, min: 0.0, max: 1.0 },
      { name: 'itdUs', defaultValue: 400, min: 0, max: 1000 },
      { name: 'ildDb', defaultValue: 2.0, min: 0.0, max: 6.0 },
      { name: 'panAngle', defaultValue: 0.0, min: -90.0, max: 90.0 } // Parado por padrão
    ];
  }

  constructor() {
    super();
    this.telemetryEnabled = true;
    this.sampleRate = typeof sampleRate !== 'undefined' ? sampleRate : 44100;
    
    // Fractional Delay Lines (max 2ms)
    this.delayBufLen = Math.ceil(this.sampleRate * 0.002);
    this.delayBufL = new Float32Array(this.delayBufLen);
    this.delayBufR = new Float32Array(this.delayBufLen);
    this.delayIdx = 0;
    
    // LPF para Head Shadow Filter (corte em ~1.5kHz)
    const fcShadow = 1500;
    const w0 = 2 * Math.PI * fcShadow / this.sampleRate;
    const cosW0 = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * 0.5); // Q = 0.5
    const a0 = 1 + alpha;
    
    this.lpf = {
      b0: ((1 - cosW0) / 2) / a0,
      b1: (1 - cosW0) / a0,
      b2: ((1 - cosW0) / 2) / a0,
      a1: (-2 * cosW0) / a0,
      a2: (1 - alpha) / a0,
    };
    
    this.zL_lpf = [0, 0];
    this.zR_lpf = [0, 0];
    
    // Telemetry Accumulators
    this._telemetryCount = 0;
    this._sumInL = 0; this._sumInR = 0; this._sumInLR = 0;
    this._sumOutL = 0; this._sumOutR = 0; this._sumOutLR = 0;
    this._sumMidIn = 0; this._sumSideIn = 0;
    this._sumMidOut = 0; this._sumSideOut = 0;
    this._sumMidMotion = 0; this._sumSideMotion = 0;
    this._sumDiff = 0;
    this._peakOut = 0;
    
    this.motionMode = "none";
    this.radiusM = 0;
    this.speed = 0;
    
    this.port.onmessage = (e) => {
      if (e.data?.type === 'setTelemetryEnabled') { this.telemetryEnabled = !!e.data.enabled; return; }
      if (e.data.motionMode !== undefined) this.motionMode = e.data.motionMode;
      if (e.data.radiusM !== undefined) this.radiusM = e.data.radiusM;
      if (e.data.speed !== undefined) this.speed = e.data.speed;
    };
  }

  _biquad(sample, c, z) {
    const out = c.b0 * sample + z[0];
    z[0] = c.b1 * sample - c.a1 * out + z[1];
    z[1] = c.b2 * sample - c.a2 * out;
    return out;
  }

  readLagrange(buffer, writeIdx, delaySamples) {
    const len = buffer.length;
    const intDelay = Math.floor(delaySamples);
    const frac = delaySamples - intDelay;
    
    const floorIdx = (writeIdx - intDelay + len) % len;
    
    const idx0 = (floorIdx + 1) % len;
    const idx1 = floorIdx;
    const idx2 = (floorIdx - 1 + len) % len;
    const idx3 = (floorIdx - 2 + len) % len;
    
    const x0 = buffer[idx0];
    const x1 = buffer[idx1];
    const x2 = buffer[idx2];
    const x3 = buffer[idx3];
    
    const c0 = -frac * (frac - 1) * (frac - 2) / 6.0;
    const c1 = (frac + 1) * (frac - 1) * (frac - 2) / 2.0;
    const c2 = -(frac + 1) * frac * (frac - 2) / 2.0;
    const c3 = (frac + 1) * frac * (frac - 1) / 6.0;
    
    return c0 * x0 + c1 * x1 + c2 * x2 + c3 * x3;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (!input || input.length < 2) return true;
    
    const inL = input[0];
    const inR = input[1];
    const outL = output[0];
    const outR = output[1];
    const blockSize = inL.length;
    
    const wet = parameters.wet.length > 1 ? parameters.wet[0] : parameters.wet[0];
    const itdUs = parameters.itdUs.length > 1 ? parameters.itdUs[0] : parameters.itdUs[0];
    const ildDb = parameters.ildDb.length > 1 ? parameters.ildDb[0] : parameters.ildDb[0];
    const panAngle = parameters.panAngle.length > 1 ? parameters.panAngle[0] : parameters.panAngle[0];
    
    // Bypass if wet is 0
    if (wet <= 0.001) {
      outL.set(inL);
      outR.set(inR);
      return true;
    }
    
    // Binaural parameters based on panning angle (-90 to +90 degrees)
    // Positive angle = right, Negative angle = left
    const panRad = (panAngle * Math.PI) / 180.0;
    
    // ITD: max delay applied to contralateral ear
    const itdSamples = (itdUs / 1e6) * this.sampleRate;
    let delayL = 0;
    let delayR = 0;
    if (panAngle > 0) delayL = itdSamples * Math.sin(panRad);
    else if (panAngle < 0) delayR = itdSamples * Math.abs(Math.sin(panRad));
    
    // ILD: amplitude attenuation applied to contralateral ear (linear factor)
    const ildLinear = Math.pow(10, -ildDb / 20.0);
    let attL = 1.0;
    let attR = 1.0;
    if (panAngle > 0) attL = ildLinear * Math.sin(panRad) + (1.0 - Math.sin(panRad));
    else if (panAngle < 0) attR = ildLinear * Math.abs(Math.sin(panRad)) + (1.0 - Math.abs(Math.sin(panRad)));
    
    for (let i = 0; i < blockSize; i++) {
      const L = inL[i];
      const R = inR[i];
      
      // Store in delay buffers
      this.delayBufL[this.delayIdx] = L;
      this.delayBufR[this.delayIdx] = R;
      
      // Apply Head Shadow LPF only if attenuated
      let shadowL = this.readLagrange(this.delayBufL, this.delayIdx, delayL);
      let shadowR = this.readLagrange(this.delayBufR, this.delayIdx, delayR);
      
      if (panAngle > 0) shadowL = this._biquad(shadowL, this.lpf, this.zL_lpf) * attL + shadowL * (1.0 - Math.sin(panRad));
      else if (panAngle < 0) shadowR = this._biquad(shadowR, this.lpf, this.zR_lpf) * attR + shadowR * (1.0 - Math.abs(Math.sin(panRad)));
      
      // Protect Center: Mid signal remains untouched, processing is applied mainly to Side
      const mid = (L + R) * 0.5;
      const sideIn = (L - R) * 0.5;
      
      const shadowMid = (shadowL + shadowR) * 0.5;
      const shadowSideL = shadowL - shadowMid;
      const shadowSideR = shadowR - shadowMid;
      
      const procL = mid + shadowSideL;
      const procR = mid + shadowSideR;
      
      const finalL = L * (1.0 - wet) + procL * wet;
      const finalR = R * (1.0 - wet) + procR * wet;
      
      outL[i] = finalL;
      outR[i] = finalR;
      
      this.delayIdx = (this.delayIdx + 1) % this.delayBufLen;
      
      // --- Telemetry Accumulators ---
      this._sumInL += L * L;
      this._sumInR += R * R;
      this._sumInLR += L * R;
      
      this._sumOutL += finalL * finalL;
      this._sumOutR += finalR * finalR;
      this._sumOutLR += finalL * finalR;
      
      const midOut = (finalL + finalR) * 0.5;
      const sideOut = (finalL - finalR) * 0.5;
      
      this._sumMidIn += mid * mid;
      this._sumSideIn += sideIn * sideIn;
      this._sumMidOut += midOut * midOut;
      this._sumSideOut += sideOut * sideOut;
      
      this._sumMidMotion += (midOut - mid) * (midOut - mid);
      this._sumSideMotion += (sideOut - sideIn) * (sideOut - sideIn);
      
      this._sumDiff += (finalL - L) * (finalL - L) + (finalR - R) * (finalR - R);
      
      const peak = Math.max(Math.abs(finalL), Math.abs(finalR));
      if (peak > this._peakOut) this._peakOut = peak;
    }
    
    this._telemetryCount++;
    if (this._telemetryCount >= 60) {
      const N = 60 * blockSize;
      
      // Calculate Correlations
      const inL_rms = Math.sqrt(this._sumInL / N) + 1e-12;
      const inR_rms = Math.sqrt(this._sumInR / N) + 1e-12;
      const inCorr = (this._sumInLR / N) / (inL_rms * inR_rms);
      
      const outL_rms = Math.sqrt(this._sumOutL / N) + 1e-12;
      const outR_rms = Math.sqrt(this._sumOutR / N) + 1e-12;
      const outCorr = (this._sumOutLR / N) / (outL_rms * outR_rms);
      
      const midEnergy = Math.sqrt(this._sumMidOut / N);
      const sideEnergy = Math.sqrt(this._sumSideOut / N);
      
      // Center Drift (Difference between L and R RMS)
      const centerDrift = Math.abs(outL_rms - outR_rms);
      
      const diffRMS = Math.sqrt(this._sumDiff / (N * 2));
      const midMotionRMS = Math.sqrt(this._sumMidMotion / N);
      const sideMotionRMS = Math.sqrt(this._sumSideMotion / N);
      
      // Mono Compatibility Loss
      const inMonoEnergy = Math.sqrt(this._sumMidIn / N) + 1e-12;
      const outMonoEnergy = midEnergy + 1e-12;
      const monoLossDb = 20 * Math.log10(outMonoEnergy / inMonoEnergy);
      
      const outputPeakDb = 20 * Math.log10(this._peakOut + 1e-12);
      
      const hasSignal = inL_rms > 0.00001 || inR_rms > 0.00001;
      
      if (hasSignal) {
        if (this.telemetryEnabled) this.port.postMessage({ type: 'telemetry',
          name: 'Spatial8D',
          mode: this.motionMode,
          azimuthDeg: panAngle.toFixed(0),
          elevationDeg: "0",
          radiusM: this.radiusM.toFixed(1),
          speed: this.speed.toFixed(2) + 'x',
          inputCorr: inCorr.toFixed(2),
          outputCorr: outCorr.toFixed(2),
          midEnergy: midEnergy.toFixed(3),
          sideEnergy: sideEnergy.toFixed(3),
          centerDrift: centerDrift.toFixed(3),
          ildDb: ildDb.toFixed(1),
          itdUs: itdUs.toFixed(0),
          wet: wet.toFixed(2),
          diffRMS: diffRMS.toFixed(3),
          midMotion: midMotionRMS.toFixed(4),
          sideMotion: sideMotionRMS.toFixed(4),
          monoLossDb: monoLossDb.toFixed(1),
          outputPeak: outputPeakDb.toFixed(1) + 'dB'
        });
      }
      
      // Reset accumulators
      this._telemetryCount = 0;
      this._sumInL = 0; this._sumInR = 0; this._sumInLR = 0;
      this._sumOutL = 0; this._sumOutR = 0; this._sumOutLR = 0;
      this._sumMidIn = 0; this._sumSideIn = 0;
      this._sumMidOut = 0; this._sumSideOut = 0;
      this._sumMidMotion = 0; this._sumSideMotion = 0;
      this._sumDiff = 0;
      this._peakOut = 0;
    }
    
    return true;
  }
}

registerProcessor('spatial8d', Spatial8DProcessor);
