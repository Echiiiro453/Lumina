const _logCooldowns = new Map();
export const logToCMD = (source, message, level = "info", cooldownMs = 1000) => {
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