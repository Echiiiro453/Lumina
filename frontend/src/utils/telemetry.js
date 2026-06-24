export const logToCMD = (source, message, level = 'info') => {
  fetch('http://localhost:8000/api/telemetry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, message, level })
  }).catch(() => {});
};
