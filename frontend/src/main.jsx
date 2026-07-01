import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Em produção, limpa flags de debug que porventura tenham ficado salvas no localStorage
// de builds anteriores (quando `main.jsx` as forçava no bootstrap). Em dev elas podem
// continuar sendo ligadas manualmente pelo fluxo de diagnóstico.
if (!import.meta.env.DEV) {
  localStorage.removeItem('lumina.debugAudioLagProbe');
  localStorage.removeItem('lumina.disableWorkletTelemetry');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
