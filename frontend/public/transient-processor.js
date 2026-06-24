/**
 * Lumina Transient Shaper Pro v3.1
 * 
 * Processador de transientes profissional com controle de:
 *   - Attack (-1.0 a +1.0): Aumenta/suaviza o início das notas.
 *   - Sustain (-1.0 a +1.0): Aumenta/reduz a cauda do sinal (room tone).
 * 
 * Algoritmo com envelopes seguidores de pico autênticos (com constantes de
 * ataque e release separadas) para eliminar distorção harmônica (ripple) nos sub-graves.
 */
class TransientShaperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    
    const sr = typeof sampleRate !== 'undefined' ? sampleRate : 44100;

    // Fast Envelope: Attack = 1.0ms, Release = 20.0ms
    this.aAtkFast = Math.exp(-1.0 / (sr * 0.001));
    this.aRelFast = Math.exp(-1.0 / (sr * 0.020));

    // Slow Envelope: Attack = 20.0ms, Release = 150.0ms
    this.aAtkSlow = Math.exp(-1.0 / (sr * 0.020));
    this.aRelSlow = Math.exp(-1.0 / (sr * 0.150));

    // Estados dos envelopes por canal (L/R)
    this.envFast = new Float32Array(8);
    this.envSlow = new Float32Array(8);

    // Controles externos (configuráveis via porta de mensagens)
    this.attackAmount  = 0.0; // -1.0 a 1.0
    this.sustainAmount = 0.0; // -1.0 a 1.0

    this.targetActive = 0.0;
    this.currentActive = 0.0;
    this.isFirstMessage = true;

    this.port.onmessage = (e) => {
      if (e.data.active !== undefined) {
        this.targetActive = e.data.active ? 1.0 : 0.0;
        if (this.isFirstMessage) {
          this.currentActive = this.targetActive;
          this.isFirstMessage = false;
        }
      }
      if (e.data.attackAmount  !== undefined) this.attackAmount  = e.data.attackAmount;
      if (e.data.sustainAmount !== undefined) this.sustainAmount = e.data.sustainAmount;
    };
  }

  process(inputs, outputs) {
    this.currentActive += (this.targetActive - this.currentActive) * 0.002;

    if (this.currentActive < 1e-4 && this.targetActive === 0.0) {
      if (inputs[0] && inputs[0][0] && outputs[0] && outputs[0][0]) {
        outputs[0][0].set(inputs[0][0]);
        if (inputs[0][1] && outputs[0][1]) outputs[0][1].set(inputs[0][1]);
      }
      return true;
    }
    const input  = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    const channelCount = input.length;
    const att = this.attackAmount;
    const sus = this.sustainAmount;

    for (let c = 0; c < channelCount; c++) {
      const inCh  = input[c];
      const outCh = output[c];
      
      let envF = this.envFast[c];
      let envS = this.envSlow[c];

      for (let i = 0; i < inCh.length; i++) {
        const sample    = inCh[i];
        const absSample = Math.abs(sample);

        // ── Seguidor de envelope de pico rápido ──
        if (absSample > envF) {
          envF = this.aAtkFast * envF + (1.0 - this.aAtkFast) * absSample;
        } else {
          envF = this.aRelFast * envF + (1.0 - this.aRelFast) * absSample;
        }

        // ── Seguidor de envelope de pico lento ──
        if (absSample > envS) {
          envS = this.aAtkSlow * envS + (1.0 - this.aAtkSlow) * absSample;
        } else {
          envS = this.aRelSlow * envS + (1.0 - this.aRelSlow) * absSample;
        }

        const norm = envS + 1e-4; // Evitar divisão por zero
        const diff = envF - envS;

        let gain = 1.0;

        if (diff > 0) {
          // Fase de Ataque (onset)
          gain += (diff / norm) * att * 1.5;
        } else {
          // Fase de Sustain (decay/tail)
          gain += (-diff / norm) * sus * 1.5;
        }

        // Limites de segurança (prevenir clipping de barramento ou mudo total)
        const processed = sample * Math.max(0.05, Math.min(gain, 4.0));
        const mix = this.currentActive;
        outCh[i] = sample * (1.0 - mix) + processed * mix;
      }
      
      this.envFast[c] = envF;
      this.envSlow[c] = envS;
    }

    return true;
  }
}

registerProcessor('transient-shaper', TransientShaperProcessor);
