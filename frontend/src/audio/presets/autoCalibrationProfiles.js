// Single source of truth for Auto-Calibration in the live and offline chains.
// Values use the same units as PlayerBar state (wet/depth/mix are 0..1).
export const AUTO_CALIBRATION_PROFILES = Object.freeze({
  limpo: Object.freeze({
    id: 'limpo', label: 'Som Limpo', extraHeadroomDb: 0.0, maxMakeupDb: 0.0,
    eqGains: [-2, -1, 0, 0, 0, 1, 1.5, 1, 0, -1],
    stereoWidth: 'Natural', bassEnhancer: false, enableDeesser: true,
    enableDeharsh: true, enableTransient: true, enableSaturation: false,
    enableStereoDepth: false, enable8D: false, reverbMix: 0, subMono: false
  }),
  espacial: Object.freeze({
    id: 'espacial', label: 'Espacial', extraHeadroomDb: -2.2, maxMakeupDb: 0.3,
    eqGains: [1, 0.5, 0, 0, 0.5, 1, 1.5, 2, 1.5, 1],
    stereoWidth: 'Ultra', enableStereoDepth: true, stereoDepthAmount: 0.55,
    enable8D: true, spatialMode: 'Catedral', reverbMix: 0.10,
    enableSaturation: false, bassEnhancer: false, subMono: false
  }),
  grave: Object.freeze({
    id: 'grave', label: 'Mais Grave', extraHeadroomDb: -4.5, maxMakeupDb: 0.3,
    eqGains: [1.5, 1.5, 1.0, 0.5, 0, 0, 0, 0, 0, 0],
    lowShelfDb: 1.5, bassEnhancer: true, bassIntensity: 55,
    subMono: true, lowSideGain: 0.0, enableSaturation: false, reverbMix: 0
  }),
  quente: Object.freeze({
    id: 'quente', label: 'Mais Quente', extraHeadroomDb: -4.5, maxMakeupDb: 0.3,
    eqGains: [1.5, 2, 2.5, 1.5, 0.5, 0, -0.5, -1, -1.5, -2],
    enableSaturation: true, satDrive: 0.14, satMix: 0.22,
    satMode: 'tape', saturationOutputTrimDb: -2.5,
    reverbMix: 0, bassEnhancer: false, subMono: false
  }),
  cinema: Object.freeze({
    id: 'cinema', label: 'Cinema', extraHeadroomDb: -3.5, maxMakeupDb: 0.3,
    eqGains: [2.5, 1.8, 0.8, 0, -0.5, 0, 0.8, 1.5, 2, 2],
    spatialMode: 'Teatro', reverbMix: 0.08, roomWetMax: 0.10,
    wetHpfHz: 180, spatialWet: 0.16, enableStereoDepth: true,
    stereoDepthAmount: 0.45, enableSaturation: false,
    bassEnhancer: false, subMono: false
  }),
  antifadiga: Object.freeze({
    id: 'antifadiga', label: 'Anti-Fadiga', extraHeadroomDb: -0.8, maxMakeupDb: 0.8,
    eqGains: [0, 0.5, 0.5, 0, -0.5, -0.5, -1, -1, -2, -2],
    presenceDb: -1, highShelfDb: -2, enableDeharsh: true,
    enableDeesser: true, stereoWidth: 'Estreito', enableSaturation: false,
    reverbMix: 0, subMono: false
  })
});

// Short-lived attenuation used only while a seek transition settles.
export const SEEK_TEMP_HEADROOM_DB = -0.8;

export function getAutoCalibrationProfile(id) {
  return id ? AUTO_CALIBRATION_PROFILES[id] || null : null;
}

export function calculateAnticipativeHeadroom(
  profile,
  peakRawProfileDb,
  plannedMakeupDb = profile?.maxMakeupDb || 0,
  targetPeakDb = -2.0,
  dangerMarginDb = 0.8
) {
  let effectiveExtraHeadroomDb = profile?.extraHeadroomDb || 0;
  let makeupDb = Math.max(0, Math.min(plannedMakeupDb, profile?.maxMakeupDb || 0));

  // Makeup must not participate in a hot profile. Compute the safety trim from
  // the raw profile peak and apply it to the actual pre-master GainNode.
  if (peakRawProfileDb + effectiveExtraHeadroomDb > targetPeakDb) {
    makeupDb = 0;
    effectiveExtraHeadroomDb = targetPeakDb - dangerMarginDb - peakRawProfileDb;
  }

  effectiveExtraHeadroomDb = Math.max(-12, Math.min(0, effectiveExtraHeadroomDb));
  return { effectiveExtraHeadroomDb, makeupDb };
}
