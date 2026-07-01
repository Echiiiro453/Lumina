/**
 * autoEqIrStage.js
 * Lumina — AutoEQ WAV / Impulse Response Stage
 *
 * Insere um ConvolverNode transparente entre o ReplayGain e os filtros Biquad
 * do AutoEQ TXT. Quando nenhum WAV está carregado, funciona como bypass puro
 * (dryGain=1, wetGain=0).
 *
 * Topology:
 *   input → preGain ──→ dryGain ──────────────────→ output
 *                   └──→ convolver → wetGain ──────↗
 */

function dbToGain(db) {
  return Math.pow(10, db / 20);
}

// Mapeia a intensidade do seletor de UI para os valores de dry/wet
const INTENSITY_MAP = {
  leve:     { wet: 0.35, dry: 0.65 },
  natural:  { wet: 0.65, dry: 0.35 },
  completa: { wet: 1.00, dry: 0.00 },
};

/**
 * Cria o estágio de IR. Retorna um objeto de stage.
 * O estágio começa em bypass (dryGain=1, wetGain=0).
 *
 * @param {AudioContext} audioCtx
 * @returns {{ input: GainNode, output: GainNode, irInfo: object|null }}
 */
export function createAutoEqIrStage(audioCtx) {
  const input    = audioCtx.createGain();
  const preGain  = audioCtx.createGain();
  const dryGain  = audioCtx.createGain();
  const wetGain  = audioCtx.createGain();
  const output   = audioCtx.createGain();

  // Estado inicial: bypass total
  preGain.gain.value = 1.0;
  dryGain.gain.value = 1.0;
  wetGain.gain.value = 0.0;

  // Topologia fixa — estas ligações nunca são desconectadas
  input.connect(preGain);
  preGain.connect(dryGain);
  dryGain.connect(output);
  wetGain.connect(output); // permanente: wetGain → output sempre existe, só o gain varia
  // A ramificação do convolver (preGain → convolver → wetGain) é conectada ao carregar o WAV

  return {
    input,
    preGain,
    dryGain,
    wetGain,
    output,
    _convolver: null,
    irInfo: null,
  };
}

/**
 * Carrega um WAV (ArrayBuffer ou File) e conecta o ConvolverNode.
 *
 * @param {object} stage - objeto retornado por createAutoEqIrStage
 * @param {AudioContext} audioCtx
 * @param {ArrayBuffer|File} fileOrBuffer
 * @param {{ preampDb?: number, intensity?: string, fileName?: string }} options
 */
export async function loadAutoEqWav(stage, audioCtx, fileOrBuffer, options = {}) {
  const preampDb  = options.preampDb  ?? 0;
  const intensity = options.intensity ?? 'completa';
  const fileName  = options.fileName  ?? 'unknown.wav';

  // Resolve ArrayBuffer
  let arrayBuffer;
  if (fileOrBuffer instanceof File) {
    arrayBuffer = await fileOrBuffer.arrayBuffer();
  } else {
    arrayBuffer = fileOrBuffer;
  }

  // Decodifica
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    console.error('[AutoEQ-IR] Falha ao decodificar WAV:', err);
    throw err;
  }

  // Remove convolver anterior se existia
  _disconnectConvolver(stage, audioCtx);

  // Cria novo convolver
  const convolver = audioCtx.createConvolver();
  convolver.normalize = false; // Preserva a curva da IR sem normalização automática
  convolver.buffer = audioBuffer;

  // Conecta apenas: preGain → convolver → wetGain
  // (wetGain → output já é permanente, criado em createAutoEqIrStage)
  stage.preGain.connect(convolver);
  convolver.connect(stage.wetGain);
  stage._convolver = convolver;

  // Aplica preamp no preGain
  const preGainVal = dbToGain(preampDb);
  stage.preGain.gain.setTargetAtTime(preGainVal, audioCtx.currentTime, 0.01);

  // Aplica intensidade (dry/wet)
  _applyIntensity(stage, audioCtx, intensity);

  // Atualiza metadados
  stage.irInfo = {
    type:               'wav-ir',
    loaded:             true,
    convolverConnected: true,
    sampleRate:         audioBuffer.sampleRate,
    durationMs:         Math.round(audioBuffer.duration * 1000),
    channels:           audioBuffer.numberOfChannels,
    preampDb,
    intensity,
    fileName,
  };

  console.info(`[AutoEQ-IR] WAV carregado: ${fileName} | ${audioBuffer.sampleRate}Hz | ${stage.irInfo.durationMs}ms | ch:${audioBuffer.numberOfChannels}`);
}

/**
 * Desativa o estágio WAV e retorna para bypass puro.
 * Desconecta o convolver com segurança.
 *
 * @param {object} stage
 * @param {AudioContext} audioCtx
 */
export function disableAutoEqWav(stage, audioCtx) {
  _disconnectConvolver(stage, audioCtx);

  // Volta para bypass
  stage.preGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
  stage.dryGain.gain.setTargetAtTime(1.0, audioCtx.currentTime, 0.01);
  stage.wetGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.01);

  stage.irInfo = null;
  console.info('[AutoEQ-IR] WAV removido — estágio em bypass');
}

/**
 * Atualiza apenas a intensidade (dry/wet/preamp) de um estágio já carregado.
 *
 * @param {object} stage
 * @param {AudioContext} audioCtx
 * @param {string} intensity - 'leve' | 'natural' | 'completa'
 */
export function setAutoEqIrIntensity(stage, audioCtx, intensity) {
  if (!stage.irInfo?.loaded) return;
  _applyIntensity(stage, audioCtx, intensity);
  if (stage.irInfo) stage.irInfo.intensity = intensity;
}

/**
 * Libera todos os nós do estágio (para cleanup ao destruir o player).
 * @param {object} stage
 */
export function disposeAutoEqIrStage(stage) {
  try { if (stage._convolver) stage._convolver.disconnect(); } catch { /* noop */ }
  try { stage.preGain.disconnect(); } catch { /* noop */ }
  try { stage.dryGain.disconnect(); } catch { /* noop */ }
  try { stage.wetGain.disconnect(); } catch { /* noop */ }
  try { stage.input.disconnect(); } catch { /* noop */ }
  try { stage.output.disconnect(); } catch { /* noop */ }
  stage._convolver = null;
  stage.irInfo = null;
}

/**
 * Retorna uma cópia dos metadados do IR.
 * @param {object} stage
 * @returns {object|null}
 */
export function getAutoEqIrInfo(stage) {
  return stage.irInfo ? { ...stage.irInfo } : null;
}

// ── Helpers privados ────────────────────────────────────────────────────────

function _disconnectConvolver(stage, audioCtx) {
  if (!stage._convolver) return;

  // Desconecta apenas o convolver da cadeia.
  // wetGain → output é uma ligação PERMANENTE e NUNCA é desconectada aqui,
  // para garantir que um segundo load funcione corretamente.
  try {
    stage.preGain.disconnect(stage._convolver);
  } catch { /* noop */ }

  try {
    stage._convolver.disconnect(); // desconecta o convolver de todas as saídas
  } catch { /* noop */ }

  stage._convolver = null;

  // Silencia suavemente o canal wet
  if (audioCtx) {
    stage.wetGain.gain.setTargetAtTime(0.0, audioCtx.currentTime, 0.005);
  }
}

function _applyIntensity(stage, audioCtx, intensityKey) {
  const key    = (intensityKey || 'completa').toLowerCase();
  const levels = INTENSITY_MAP[key] || INTENSITY_MAP.completa;
  const t      = audioCtx.currentTime;
  stage.dryGain.gain.setTargetAtTime(levels.dry, t, 0.01);
  stage.wetGain.gain.setTargetAtTime(levels.wet, t, 0.01);
}
