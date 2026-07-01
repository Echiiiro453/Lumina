# Review de DSP / Áudio (Fase 10)

## Escopo

Esta é uma fase de **revisão**, não de refatoração. O roadmap (`docs/refactor-roadmap.md`)
classifica qualquer mudança na cadeia de áudio e em `PlayerBar.jsx` como a fase de
**maior risco**, exigindo testes de regressão auditivos (Auto-Calib, Seek/Tail Reset,
Bass Torture, sessão longa) que não podem roda offline neste ambiente.

Portanto, o critério de pronto desta fase é:

1. Confirmar que nenhuma mudança deste branch alterou o caminho de áudio (DSP).
2. Confirmar que as únicas alterações em worklets foram em **telemetria/medição**
   (passthrough), sem tocar o retorno de `process()`.
3. Documentar o plano de extração de hooks do `PlayerBar.jsx` como PRs futuros.

## Worklets alterados neste branch

### `frontend/public/lufs-meter-processor.js`

Commit: `e116980` — *gate lufs telemetry and avoid direct render updates*

Mudanças:
- Adicionado `this.telemetryEnabled` (default `true`) e handler `port.onmessage`
  para `setTelemetryEnabled`.
- Quando `telemetryEnabled === false`, o worklet **pula o `postMessage`** de
  medição. O cálculo de LUFS e o processamento de áudio continuam idênticos.
- Clamp de `-Infinity` → `-70` no valor **reportado** (não no áudio) para evitar
  NaN na UI.
- Payload padronizado para `{ type: 'telemetry', name: 'LUFS', lufs }`.

Veredicto: **DSP-safe.** O caminho de áudio (`process()` → `return true`) é
idêntico ao baseline. LUFS é nó de medição, não afeta o sinal.

### `frontend/public/stereo-scope-processor.js`

Commit: `6497d5b` — *respect telemetry gate in stereo scope processor*

Mudanças:
- Corrigido **bug real**: o constructor atribuía `this.port.onmessage` duas vezes.
  A segunda atribuição (handler de `phaseRescue`) sobrescrevia a primeira
  (handler de `setTelemetryEnabled`), deixando o gate de telemetria inalcançável
  — `telemetryEnabled` ficava sempre `true`.
- Unificado em **handler único** que despacha por `data.type`.
- O `postMessage` de telemetria (que já era condicional a `telemetryEnabled`)
  agora **realmente respeita** o flag.

Veredicto: **DSP-safe e corrige bug.** StereoScope é nó de medição; o sinal de
áudio não é alterado.

## Outros worklets

`git diff main..HEAD -- 'frontend/public/*-processor.js'` mostra quatro arquivos
alterados:

- `lufs-meter-processor.js` — revisado acima (telemetria);
- `stereo-scope-processor.js` — revisado acima (telemetria);
- `ab-comparator-processor.js` — apenas `/* eslint-disable no-unused-vars */` no topo;
- `saturation-processor.js` — apenas `/* eslint-disable no-unused-vars */` no topo.

As duas últimas são **comentários de lint** adicionados para silenciar warnings de
`AudioWorkletProcessor` referenciado mas não "usado" (padrão do tipo de arquivo).
Sem qualquer mudança no corpo do processador, nos parâmetros ou no `process()`.

Os demais worklets que aparecem como modified no `git status` da árvore de trabalho
estão apenas **regenerados pelo build** (Phase 8), sem commit de mudança de
comportamento neste branch.

## PlayerBar.jsx

O commit `e116980` também troca `setLufsValue(val)` por `lufsValueRef.current = val`
no callback `lufsNode.port.onmessage`. Antes, o valor LUFS era armazenado em
`useState` (~10 postagens/s) mas **nunca consumido** — gerava re-renders sem
efeito visível. A troca por ref elimina o re-render storm sem perder dado (o ref
permanece disponível para diagnóstico futuro).

Sem alteração em conexões de AudioNodes, presets, headroom, limiter ou Peak Guard.

## Plano de refatoração do PlayerBar (Fase 11 — futura)

Conforme `docs/refactor-roadmap.md`, a extração de hooks deve ser **um hook por
PR**, preservando conexões e parâmetros, com testes de regressão auditiva. Esta
branch **não executa** essa refatoração. Hooks candidatos registrados para PRs
futuros:

- `useAudioEngine` — criação/teardown da cadeia de AudioNodes;
- `usePlaybackControls` — play/pause/seek/troca de faixa;
- `useHeadroomManager` — gain staging e `calculateAnticipativeHeadroom`;
- `useSeekTransition` — transições de seek sem pop/click;
- `useDSPTelemetry` — agregação dos refs de telemetria (master/stereo/source/multiband/LUFS);
- `usePerformanceGovernor` — monitor de underruns/CPU e bypass de recursos caros.

Pré-requisitos antes de iniciar a Fase 11:

1. Testes de regressão auditiva reproduzíveis (offline ou roteiro manual estável).
2. Snapshot das conexões atuais de AudioNodes por preset.
3. Validação de que cada hook extraído preserva byte-a-byte o grafo de nós.

## Conclusão

Nenhuma mudança deste branch altera o som. As únicas alterações em worklets são
em ports de telemetria (medição), não no caminho de áudio. A refatoração do
`PlayerBar.jsx` é deliberadamente deferida por ser a fase de maior risco e
exigir validação auditiva que escapa ao escopo de higiene/segurança deste branch.
