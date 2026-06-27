const _logCooldowns = new Map();

export const AUDIO_TELEMETRY_LOGS_ENABLED = false;
export const AUDIO_DEBUG_LOGS_ENABLED = false;
export const AUDIO_LOG_BUFFER_MAX = 0;
export const MAX_VISIBLE_LOGS = 100;

export const AUDIO_LOG_PREFIXES = [
  '[DSP-MASTEROUT]',
  '[DSP-STEREOSCOPE]',
  '[DSP-ABCOMPARE]',
  '[DSP-IRSPACE]',
  '[DSP-GENREPROFILE]',
  '[PERFORMANCEGOVERNOR]',
  '[SOUNDPRESET]',
  '[LUFS]',
];

export const AUDIO_LOG_SOURCES = [
  'DSP-MASTEROUT',
  'DSP-STEREOSCOPE',
  'DSP-ABCOMPARE',
  'DSP-IRSPACE',
  'DSP-GENREPROFILE',
  'PERFORMANCEGOVERNOR',
  'SOUNDPRESET',
  'LUFS',
];

export const isAudioTelemetryLine = (source, message = '') => {
  const normalizedSource = String(source || '').trim().toUpperCase();
  const normalizedMessage = String(message || '').trim().toUpperCase();
  return (
    AUDIO_LOG_SOURCES.includes(normalizedSource) ||
    AUDIO_LOG_PREFIXES.some((prefix) => normalizedMessage.startsWith(prefix))
  );
};

export const areAudioDebugLogsEnabled = () => (
  AUDIO_TELEMETRY_LOGS_ENABLED ||
  AUDIO_DEBUG_LOGS_ENABLED ||
  (typeof localStorage !== 'undefined' && localStorage.getItem('lumina.debugAudioLogs') === '1')
);

export const logToCMD = (source, message, level = "info", cooldownMs = 1000) => {
  if (isAudioTelemetryLine(source, message) && !areAudioDebugLogsEnabled()) {
    return;
  }

  const now = Date.now();
  const lastTime = _logCooldowns.get(source) || 0;
  if (now - lastTime < cooldownMs) return;
  _logCooldowns.set(source, now);
  fetch("http://localhost:8000/api/telemetry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source, message, level })
  }).catch(() => { /* Diagnostic logging is best-effort. */ });
};
