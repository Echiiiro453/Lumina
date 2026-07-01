# Matriz de Investigação de Lag de Áudio (Lumina)

Preencha os resultados dos testes abaixo para isolar o causador do lag progressivo de UI.

## Como capturar os relatórios
1. Abra o Console do navegador (DevTools).
2. Cole `window.__LUMINA_AUDIO_LAG_PROBE__.report('Nome do Teste')`
3. Copie as informações de `uptimeSec`, `usedMB`, timers, `rafLive` e `portMessages`.

---

| Teste | Configuração | Tempo até lag | Resultado (Travou? / Renders / Memória MB / RAFs vivos / Intervalos) | Observações |
| :--- | :--- | :--- | :--- | :--- |
| **1. Baseline normal** | Diagnóstico fechado, logs bloqueados, preset normal. Tocar 30 min. | | | |
| **2. Telemetria desligada** | `lumina.disableWorkletTelemetry = 1`. Diagnóstico fechado. | | | |
| **3. UI/Visualizer off** | `lumina.disableWorkletTelemetry = 1`, sem visualizer. | | | |
| **4. Lyrics off** | Desativar busca de letras/sync. | | | |
| **5. Perf Governor off** | Sem telemetria para o PerformanceGovernor. | | | |
| **6. Sem presets** | Modo limpo (sem AutoEQ, Reverb, Spatial). | | | |
| **7. Preset pesado** | Cinema 8D/Lo-Fi + AutoEQ + Spatial. | | | |
| **8. Diagnóstico sem Soak**| Diagnóstico aberto (Soak desativado). | | | |
| **9. Diagnóstico c/ Soak** | Diagnóstico aberto (Soak ligado). | | | |

---

## Resultados React Profiler
*(Cole aqui os resultados do React Profiler capturados nos 30 minutos)*

- Componente com mais renders: 
- Componente com maior self time: 
- Componente com maior commit time: 
- Render causado por props/state: 

## Diagnóstico Final
- **Causa raiz encontrada:** 
- **Evidência:** 
