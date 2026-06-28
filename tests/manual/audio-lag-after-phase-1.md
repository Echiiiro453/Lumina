# Teste de lag após Fase 1

> **Status:** TEMPLATE — preencher após validação manual.
>
> Este teste valida se as correções da Fase 1 (PR 1.1 a 1.4) resolveram o lag progressivo
> da interface. Exige execução real do app por ~90 minutos, o que não pode ser automatizado
> nesta sessão. Os campos abaixo devem ser preenchidos pelo operador que rodar o teste.

## Commits testados (Fase 1)

| PR | Commit source | Commit assets |
|---|---|---|
| 1.1 — Desligar debug/probe forçado | `424f6c5` | `663c4ab` |
| 1.2 — Corrigir rAF órfão no diagnóstico | `3d33a72` | `c8424a0` |
| 1.3 — Gate LUFS + clamp worklet | `e116980` | `5ee33ab` |
| 1.4 — Gate telemetria StereoScope | `6497d5b` | `821bf7c` |

Commit inicial de referência: `96577f2` (baseline).
Branch: `chore/project-hygiene-docs-lint-runtime`

## O que foi corrigido (resumo)

- **PR 1.1**: `audioLagProbe` (instrumentação de render/timer) não fica mais sempre ON em
  produção; flags de debug não são mais forçadas no bootstrap do `main.jsx`.
- **PR 1.2**: `drawCurve` (diagnóstico) não agenda mais 2 `requestAnimationFrame` por ciclo;
  acabou o rAF órfão acumulando enquanto o painel de diagnóstico ficava aberto.
- **PR 1.3**: `lufsNode.port.onmessage` não chama mais `setLufsValue` (re-render ~10×/s sem
  consumidor); virou escrita em ref. Worklet LUFS agora respeita `telemetryEnabled` e clampa
  `-Infinity` → `-70`.
- **PR 1.4**: StereoScope tinha `port.onmessage` duplicado; o gate de telemetria estava morto.
  Unificado em handler único.

## Pré-requisitos antes do teste

No DevTools console (antes de iniciar), confirmar que as flags de debug estão limpas:

```js
localStorage.getItem('lumina.debugAudioLagProbe')   // deve ser null
localStorage.getItem('lumina.disableWorkletTelemetry') // deve ser null
```

Se não forem `null`, recarregar a página (o `main.jsx` em produção remove-as no boot) ou
rodar manualmente:

```js
localStorage.removeItem('lumina.debugAudioLagProbe')
localStorage.removeItem('lumina.disableWorkletTelemetry')
```

## Cenários de teste

Para cada cenário: tocar música contínua por 30 minutos, registrar FPS / underruns / clips /
uso de memória no início e no fim, e subjetivamente avaliar fluidez da UI (scroll, abrir
modais, arrastar sliders, seek).

| Cenário | Duração | Início (FPS/Mem/Underruns/Clips) | Fim (FPS/Mem/Underruns/Clips) | Resultado |
|---|---|---|---|---|
| 1. Diagnóstico **fechado** | 30 min | | | ☐ pass ☐ fail |
| 2. Diagnóstico **aberto** (sem Soak) | 30 min | | | ☐ pass ☐ fail |
| 3. Diagnóstico + **Soak** | 30 min | | | ☐ pass ☐ fail |

### Critério de PASS por cenário

- FPS não cai de forma sustentada (mantém próximo do baseline; quedas pontuais OK).
- Underruns não crescem de forma ilimitada (esperado: baixo e estável).
- Clips não acumulam indefinidamente.
- Memória (JS heap) não cresce de forma monotônica sem estabilizar.
- UI permanece responsiva no fim dos 30 min (scroll/seek/abrir modal sem travamento).

### Sinais de regressão (FAIL)

- FPS cai progressivamente ao longo dos 30 min.
- Memória cresce sem estabilizar (leak).
- UI trava ao abrir diagnóstico / modais no fim do teste.
- Aparecimento de cliques/pops de áudio (indica regressão DSP — investigar antes de seguir).

## Como ler as métricas

- **FPS / Underruns / Clips**: painel de Diagnóstico → seção DSP Performance Monitor /
  DSP Health Monitor. Ou via DevTools: `window.__LUMINA_AUDIO_LAG_PROBE__` (se habilitado).
- **Memória**: DevTools → Performance Monitor → JS Heap Size (ou Memory tab → Take heap
  snapshot no início e fim para comparar).

## Resultado consolidado

```
Commit testado:           <preencher>
Diagnóstico fechado 30 min: <pass/fail> — FPS: <x> → <y>, Mem: <a> → <b>
Diagnóstico aberto 30 min:  <pass/fail> — FPS: <x> → <y>, Mem: <a> → <b>
Diagnóstico + Soak 30 min:  <pass/fail> — FPS: <x> → <y>, Mem: <a> → <b>
Resultado geral:            <pass/fail>
Notas:                      <observações, regressões, dúvidas>
```

## Se falhar

Se qualquer cenário falhar, **não prosseguir para a Fase 2+**. Registrar aqui:

1. Qual cenário e a partir de quanto tempo o problema começou.
2. Qual métrica indicou o problema (FPS/Mem/Underruns/Clips/UI).
3. Snapshot do DevTools (heap snapshot / gravação de Performance) se possível.
4. Verificar no console se alguma flag de debug voltou sozinha ou se há erros de worklet.

A Fase 1 só deve ser considerada concluída se todos os 3 cenários passarem.
