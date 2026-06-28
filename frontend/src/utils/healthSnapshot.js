const MAX_SAFE_STRING = 160;

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const roundNumber = (value, digits = 2) => {
  const number = toFiniteNumber(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
};

const safeString = (value) => {
  if (typeof value !== 'string') return null;
  return value.replace(/[\r\n\t]+/g, ' ').slice(0, MAX_SAFE_STRING);
};

export const sanitizeFilePath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') {
    return {
      fileName: null,
      extension: null,
      isLikelyLocalFile: false,
      isInsideDownloadsOrLibrary: null
    };
  }

  const withoutQuery = filePath.split(/[?#]/)[0];
  const normalized = withoutQuery.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const fileName = safeString(parts[parts.length - 1] || null);
  const extensionMatch = fileName?.match(/\.([a-z0-9]{1,8})$/i);
  const lowerPath = normalized.toLowerCase();

  return {
    fileName,
    extension: extensionMatch ? extensionMatch[1].toLowerCase() : null,
    isLikelyLocalFile: !/^https?:\/\//i.test(filePath),
    isInsideDownloadsOrLibrary: /\/?(downloads|library|biblioteca|musicas|músicas)\//i.test(lowerPath)
  };
};

const getMemoryEstimate = () => {
  const memory = typeof performance !== 'undefined' ? performance.memory : null;
  if (!memory) return null;
  return {
    usedJSHeapSizeMb: roundNumber(memory.usedJSHeapSize / 1024 / 1024, 1),
    totalJSHeapSizeMb: roundNumber(memory.totalJSHeapSize / 1024 / 1024, 1),
    jsHeapSizeLimitMb: roundNumber(memory.jsHeapSizeLimit / 1024 / 1024, 1)
  };
};

export const createHealthSnapshot = ({
  currentSong,
  isPlaying,
  audioRef,
  audioContextRef,
  masterTelemetryRef,
  stereoTelemetryRef,
  sourceQualityTelemetryRef,
  multibandStereoTelemetryRef,
  uiFps,
  logBufferSize = null,
  activeJobs = null,
  activeDownloads = null
} = {}) => {
  const audio = audioRef?.current || null;
  const ctx = audioContextRef?.current || null;
  const masterTelemetry = masterTelemetryRef?.current || null;
  const stereoTelemetry = stereoTelemetryRef?.current || null;
  const sourceTelemetry = sourceQualityTelemetryRef?.current || null;
  const multibandTelemetry = multibandStereoTelemetryRef?.current || null;
  const audioElementPlaying = audio ? !audio.paused && !audio.ended : null;

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    song: {
      title: safeString(currentSong?.title || currentSong?.name || null),
      file: sanitizeFilePath(currentSong?.file || currentSong?.path || currentSong?.url || null)
    },
    player: {
      isPlaying: typeof isPlaying === 'boolean' ? isPlaying : audioElementPlaying,
      currentTime: roundNumber(audio?.currentTime),
      duration: roundNumber(Number.isFinite(audio?.duration) ? audio.duration : null),
      audioContextState: ctx?.state || null,
      documentHidden: typeof document !== 'undefined' ? document.hidden : null
    },
    audio: {
      headroomDb: roundNumber(masterTelemetry?.headroomDb, 1),
      peakDb: roundNumber(masterTelemetry?.peakDb, 1),
      peakPreMasterDb: roundNumber(masterTelemetry?.peakPreMasterDb, 1),
      clipCount: toFiniteNumber(masterTelemetry?.clipCount),
      limiterReductionDb: roundNumber(masterTelemetry?.limiterReductionDb, 1),
      phaseCorrelation: roundNumber(stereoTelemetry?.corr ?? stereoTelemetry?.correlation ?? multibandTelemetry?.corr, 3),
      sourceClipCount: toFiniteNumber(sourceTelemetry?.sourceClipCount)
    },
    performance: {
      governorRisk: safeString(masterTelemetry?.governorRisk || null),
      governorActive: typeof masterTelemetry?.governorActive === 'boolean' ? masterTelemetry.governorActive : null,
      underruns: toFiniteNumber(masterTelemetry?.underruns),
      recentUnderruns: toFiniteNumber(masterTelemetry?.recentUnderruns),
      uiFps: roundNumber(masterTelemetry?.uiFps ?? uiFps, 0),
      avgCpuMs: roundNumber(masterTelemetry?.avgCpuMs, 2),
      cpuLoad: roundNumber(masterTelemetry?.cpuLoad, 1),
      memory: getMemoryEstimate()
    },
    logs: {
      bufferSize: toFiniteNumber(logBufferSize),
      // Derivado do flag real do player (localStorage 'lumina.disableWorkletTelemetry'),
      // em vez de afirmar 'true' sempre. true => telemetria de worklets desligada.
      audioLogsDisabled: typeof localStorage !== 'undefined'
        ? localStorage.getItem('lumina.disableWorkletTelemetry') === '1'
        : null,
      // Não há medição confiável de throttling aqui; null = desconhecido (antes era 'true').
      telemetryThrottled: null
    },
    downloads: {
      activeJobs: toFiniteNumber(activeJobs),
      activeDownloads: toFiniteNumber(activeDownloads)
    }
  };
};

export const evaluateHealthAlerts = (snapshot, baseline = null, previous = null) => {
  const alerts = [];
  const clipStart = baseline?.audio?.clipCount ?? snapshot?.audio?.clipCount ?? 0;
  const currentClips = snapshot?.audio?.clipCount ?? 0;
  const underrunStart = baseline?.performance?.underruns ?? snapshot?.performance?.underruns ?? 0;
  const currentUnderruns = snapshot?.performance?.underruns ?? 0;
  const previousTimestamp = previous?.timestamp ? Date.parse(previous.timestamp) : null;
  const currentTimestamp = snapshot?.timestamp ? Date.parse(snapshot.timestamp) : null;

  if (currentClips > clipStart) {
    alerts.push({
      type: 'clipCount',
      severity: 'error',
      message: `clipCount aumentou (${clipStart} -> ${currentClips})`
    });
  }

  if (snapshot?.performance?.governorRisk === 'CRITICAL') {
    alerts.push({
      type: 'governorRisk',
      severity: 'error',
      message: 'Performance Governor em CRITICAL'
    });
  }

  if (currentUnderruns > underrunStart) {
    alerts.push({
      type: 'underruns',
      severity: 'warn',
      message: `underruns aumentaram (${underrunStart} -> ${currentUnderruns})`
    });
  }

  if (snapshot?.performance?.uiFps !== null && snapshot.performance.uiFps < 30) {
    alerts.push({
      type: 'uiFps',
      severity: 'warn',
      message: `UI FPS baixo (${snapshot.performance.uiFps})`
    });
  }

  if (snapshot?.player?.isPlaying && snapshot?.player?.audioContextState === 'suspended') {
    alerts.push({
      type: 'audioContext',
      severity: 'warn',
      message: 'AudioContext suspended enquanto player indica reprodução'
    });
  }

  if (snapshot?.logs?.bufferSize !== null && snapshot.logs.bufferSize > 1000) {
    alerts.push({
      type: 'logBufferSize',
      severity: 'warn',
      message: `buffer de logs alto (${snapshot.logs.bufferSize})`
    });
  }

  if (snapshot?.player?.isPlaying && snapshot?.audio?.peakDb === null && snapshot?.audio?.clipCount === null) {
    alerts.push({
      type: 'telemetry',
      severity: 'warn',
      message: 'telemetria MasterOut indisponível durante reprodução'
    });
  }

  if (previousTimestamp && currentTimestamp && currentTimestamp - previousTimestamp > 90000) {
    alerts.push({
      type: 'snapshotInterval',
      severity: 'warn',
      message: 'intervalo entre snapshots passou de 90s'
    });
  }

  return alerts;
};

export const createHealthSoakReport = ({
  durationMin,
  startedAt,
  endedAt,
  cancelled = false,
  snapshots = [],
  alerts = []
}) => ({
  version: 1,
  type: 'player-health-soak-test',
  durationMin,
  startedAt,
  endedAt,
  cancelled,
  snapshotIntervalSec: 60,
  snapshotsKept: snapshots.length,
  result: alerts.some(alert => alert.severity === 'error') ? 'FAIL' : (alerts.length ? 'WARN' : 'PASS'),
  alerts,
  snapshots
});

export const downloadJsonReport = (data, filePrefix) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filePrefix}-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
