export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const EQ_PRESETS = {
  'Normal': [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  'Bass Boost': [6, 5, 4, 2, 0, 0, 0, 0, 0, 0],
  'Rock': [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
  'Pop': [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
  'Vocal': [-2, -2, 0, 2, 4, 4, 3, 1, 0, -2],
  'Electronic': [4, 3, 1, -2, -3, 0, 1, 3, 4, 5],
  'Acoustic': [2, 2, 1, 0, 0, 0, 1, 1, 2, 2]
};

export const SOUND_PRESETS = {
  'Som Limpo': {
    label: "Som Limpo",
    desc: "Quase transparente, só segurança/calibração.",
    eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    crossfeed: { active: false, gainDb: -12, delayMs: 0.25, lpfHz: 700 },
    deharsh: false,
    spatial: { active: false, wet: 0.0, motion: "Parado", speed: 0.5, radius: 2.0 },
    depth: 0.0,
    room: { preset: "Estúdio", material: "Madeira", wet: 0.0 },
    bass: { active: false, amount: 0.0 },
    saturation: { active: false, mode: "tube", drive: 0.0, mix: 0.0 },
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.5
  },
  'Fone Relaxado': {
    label: "Fone Relaxado",
    desc: "Crossfeed alto, sem fadiga, som natural.",
    crossfeed: { active: true, gainDb: -9, delayMs: 0.35, lpfHz: 750 },
    eq: [0, 0, 0, 0, 0, 0, 0, -1.0, -1.5, -2.0],
    deharsh: true,
    spatial: { active: false, wet: 0.0 },
    room: { preset: "Estúdio", material: "Tecido", wet: 0.0 },
    saturation: { active: true, mode: "tube", drive: 0.08, mix: 0.12 },
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.8
  },
  'Cinema 8D': {
    label: "Cinema 8D",
    desc: "Som rotacional ao redor da cabeça.",
    spatial: { active: true, wet: 0.30, motion: "Elipse", speed: 0.25, radius: 1.6 },
    depth: 0.55,
    room: { preset: "Cinema", material: "Tecido", wet: 0.10 },
    bass: { active: true, amount: 0.12 },
    eq: [4, 3, 1, -2, -3, 0, 1, 3, 4, 5],
    extraHeadroomDb: -2.0,
    maxMakeupDb: 1.0
  },
  'Concerto Ao Vivo': {
    label: "Concerto Ao Vivo",
    desc: "Palco de rock com acustica de hall.",
    room: { preset: "Concerto", material: "Madeira", wet: 0.14 },
    depth: 0.45,
    spatial: { active: true, wet: 0.16, motion: "Parado" },
    saturation: { active: true, mode: "tube", drive: 0.12, mix: 0.20 },
    eq: [5, 4, 3, 1, -1, -1, 0, 2, 3, 4],
    extraHeadroomDb: -1.8,
    maxMakeupDb: 0.8
  },
  'Estudio Limpo': {
    label: "Estúdio Limpo",
    desc: "Seco e preciso, sem coloracao.",
    room: { preset: "Estúdio", material: "Tecido", wet: 0.04 },
    spatial: { active: false, wet: 0.0 },
    saturation: { active: false, drive: 0.0, mix: 0.0 },
    bass: { active: false, amount: 0.0 },
    eq: [2, 2, 1, 0, 0, 0, 1, 1, 2, 2],
    deharsh: true,
    extraHeadroomDb: -0.5,
    maxMakeupDb: 0.5
  },
  'Catedral': {
    label: "Catedral",
    desc: "Reverb longo e grandioso.",
    room: { preset: "Catedral", material: "Pedra", wet: 0.11, hpf: 220, lpf: 7000 },
    depth: 0.70,
    spatial: { active: true, wet: 0.18 },
    eq: [-2, -1, 0, 2, 4, 4, 2, 0, -1, -2],
    extraHeadroomDb: -2.5,
    maxMakeupDb: 0.8
  },
  'Lo-Fi': {
    label: "Lo-Fi",
    desc: "Morno e vintage, agudos cortados.",
    saturation: { active: true, mode: "tape", drive: 0.28, mix: 0.35 },
    eq: [1.0, 0, 0, 0, 0, 0, 0, -3.0, -5.0, -6.0],
    room: { preset: "Pequena", material: "Madeira", wet: 0.04 },
    stereoWidth: 0.80,
    extraHeadroomDb: -1.5,
    maxMakeupDb: 0.8
  },
  'Bass Boost': {
    label: "Bass Boost",
    desc: "Sub-graves dominantes.",
    bass: { active: true, amount: 0.35 },
    eq: [2.5, 2.0, 1.0, 0, 0, 0, 0, 0, 0, 0],
    subMono: true,
    lowSideGain: 0.0,
    saturation: { active: true, mode: "transformer", drive: 0.12, mix: 0.18 },
    extraHeadroomDb: -2.5,
    maxMakeupDb: 0.5
  },
  'Voz Clara': {
    label: "Voz Clara",
    desc: "Presenca vocal destacada.",
    eq: [0, 0, 0, 0, 0, +1.0, +1.2, +0.6, 0, 0],
    deesser: true,
    deharsh: true,
    room: { preset: "Estúdio", wet: 0.03 },
    spatial: { active: false, wet: 0.0 },
    saturation: { active: true, mode: "tube", drive: 0.10, mix: 0.15 },
    extraHeadroomDb: -1.0,
    maxMakeupDb: 0.8
  }
};