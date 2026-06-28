// Probe de latência/lag de áudio. Desligado por padrão em produção.
// Só é ativado manualmente via `localStorage.setItem('lumina.debugAudioLagProbe', '1')`
// (geralmente setado em dev pelo fluxo de diagnóstico). Nunca force ON em bootstrap.
const ENABLED =
  typeof localStorage !== 'undefined' &&
  localStorage.getItem('lumina.debugAudioLagProbe') === '1';

const state = {
  enabled: ENABLED,
  startedAt: typeof performance !== 'undefined' ? performance.now() : 0,
  renders: {},
  intervalsCreated: 0,
  intervalsCleared: 0,
  timeoutsCreated: 0,
  timeoutsCleared: 0,
  rafCreated: 0,
  rafCanceled: 0,
  portMessages: {},
  portHandlersRegistered: {},
  setStateEvents: {},
  telemetryDropped: {},
  audioNodesCreated: {},
  audioNodesDisposed: {},
  snapshots: 0,
  soakWarnings: 0,
  logsAccepted: 0,
  logsDropped: 0,
  lastReportAt: 0,
};

export function isAudioLagProbeEnabled() {
  return state.enabled;
}

export function probeCount(group, key = 'default', amount = 1) {
  if (!state.enabled) return;
  if (!state[group]) state[group] = {};
  if (typeof state[group] === 'number') {
    state[group] += amount;
    return;
  }
  state[group][key] = (state[group][key] || 0) + amount;
}

export function probeSet(group, key, value) {
  if (!state.enabled) return;
  if (!state[group] || typeof state[group] !== 'object') {
    state[group] = {};
  }
  state[group][key] = value;
}

export function probeReport(label = 'manual') {
  if (!state.enabled) return null;

  const now = performance.now();
  const report = {
    label,
    uptimeSec: Math.round((now - state.startedAt) / 1000),
    memory: performance.memory
      ? {
          usedMB: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
          totalMB: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
          limitMB: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
        }
      : null,
    ...state,
  };

  console.log("%c=== RENDERS ===", "color: #00ff00; font-weight: bold;");
  console.table(state.renders);
  console.log("%c=== PORT MESSAGES ===", "color: #00ff00; font-weight: bold;");
  console.table(state.portMessages);
  console.table({
    uptimeSec: report.uptimeSec,
    usedMB: report.memory?.usedMB ?? 'n/a',
    intervalsLive: state.intervalsCreated - state.intervalsCleared,
    timeoutsLive: state.timeoutsCreated - state.timeoutsCleared,
    rafLive: state.rafCreated - state.rafCanceled,
    snapshots: state.snapshots,
    soakWarnings: state.soakWarnings,
    logsAccepted: state.logsAccepted,
    logsDropped: state.logsDropped,
  });

  console.log('[AUDIO-LAG-PROBE]', report);
  return report;
}

if (typeof window !== 'undefined') {
  window.__LUMINA_AUDIO_LAG_PROBE__ = {
    state,
    report: probeReport,
  };
}
