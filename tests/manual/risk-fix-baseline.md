# Baseline antes das correções

> Estado registrado **antes** de iniciar as PRs do plano `docs/risks-and-improvements.md`.
> Serve para comparar lint/build/comportamento ao longo das correções e garantir que
> nenhuma regressão entra despercebida.

## Ambiente

- **Data:** 2026-06-27
- **Branch:** `chore/project-hygiene-docs-lint-runtime`
- **Commit inicial:** `96577f2 chore: update built frontend assets`
- **Node / Vite:** Vite 7.3.1, 2234 módulos transformados
- **Plataforma:** win32 10.0.19044 x64 (Git Bash)

## Validação padrão

| Check | Resultado |
|---|---|
| `npm.cmd run lint` | ✅ **0 errors, 30 warnings** |
| `npm.cmd run build` | ✅ built em ~10.6s |

## Build (baseline)

Hashes gerados pelo `vite build` na baseline:
- `backend/static/assets/index-DLpznR19.js` (968.90 kB / gzip 276.91 kB)
- `backend/static/assets/index-Dr_mGv_3.css` (56.30 kB / gzip 10.07 kB)
- `backend/static/assets/qrcode_custom-CQeDIawf.jpg`

⚠️ **Aviso conhecido do build (não-bloqueante):** chunk > 500 kB após minificação.
Sugestão do Vite: code-splitting via `manualChunks`. **Não está no escopo desta fase.**

## Warnings conhecidos de lint (30 — todos `react-hooks/exhaustive-deps`)

Por regra da tarefa, **estes warnings não serão corrigidos automaticamente**.
Listados aqui para detecção de regressão (se algum sumir sem intenção, ou se um novo
warning aparecer, isso indica mudança indesejada).

Contagem por arquivo:

| Arquivo | Warnings |
|---|---|
| `src/App.jsx` | 7 |
| `src/components/PlayerBar.jsx` | 13 |
| `src/components/AudioDiagnosticsPanel.jsx` | 3 |
| `src/components/AudioTrimmerModal.jsx` | 1 |
| `src/components/HistoryModal.jsx` | 1 |
| `src/components/LibraryModal.jsx` | 1 |
| `src/components/SettingsModal.jsx` | 1 |
| `src/components/ShazamModal.jsx` | 1 |
| `src/components/StudioModal.jsx` | 2 |
| `src/components/TagEditorModal.jsx` | 1 |

**Total: 30 warnings.** Esta contagem **deve permanecer estável** durante as fases de
perf/UI/backend. Apenas a Fase 11 (refatoração do PlayerBar em hooks) pode alterá-la —
e mesmo assim só deve **reduzir**, nunca aumentar.

## Problemas observados na baseline (estado do working tree)

A worktree já contém modificações e arquivos não rastreados **anteriores** a este trabalho.
Eles **não serão commitados** por esta sequência de PRs. Mapeamento:

### Arquivos NÃO rastreados (untracked) — **não commitar**
- `INDEX.md`, `autoeq_main.js`, `extract_json.js`, `extract_urls.js`, `fix_unreachable.js`
- `force_probe.js`, `force_probe2.js`, `improve_probe.js`
- `instrument.js`, `instrument_playerbar.js`, `instrument_renders.js`,
  `instrument_telemetry.js`, `instrument_worklets.js`
- `test_autoeq.js`, `test_urls.js`
- `deno.zip` (não aparece no status atual; presente em `.gitignore`)
- `tests/manual/audio-lag-investigation.md`
- `frontend/src/utils/audioLagProbe.js` (arquivo de probe — será trabalhado no PR 1.1)
- `docs/risks-and-improvements.md` (documento de riscos já criado)

### Artefatos de build regenerados pelo baseline build
- `backend/static/assets/index-DLpznR19.js` (novo)
- `backend/static/assets/index-Dr_mGv_3.css` (novo)
- Removidos: `index-DM4r6PBy.js`, `index-Dyh6lzLO.css` (hashes antigos)
- Worklets em `backend/static/*-processor.js` e `index.html` re-gerados a partir de `frontend/public`

## Estratégia de commits

- **Nunca** `git add -A` ou `git add .` — sempre `git add <caminho-específico>`.
- Arquivos locais/sensíveis (cookies, banco, downloads, logs, scripts de instrumentação)
  permanecem **untracked** ou cobertos por `.gitignore`.
- Cada PR toca o mínimo de arquivos possível e é validado com lint + build (frontend) ou
  `py_compile` (backend) antes do commit.
- Commits de `backend/static` (assets construídos) ficam **separados** do commit de código
  (`chore: update built frontend assets`).

## Notas

- A Fase 0 **não altera código**. Apenas este arquivo de baseline é adicionado.
- O build da baseline já alterou `backend/static`; esses artefatos serão re-gerados a cada
  PR de frontend e commitados no passo `chore: update built frontend assets` de cada PR.
- Itens do plano que **não serão tocados** (preservam som): ordem da cadeia, presets,
  headroom floor (-12 dB), targetPeakDb (-2.0), SEEK_TEMP_HEADROOM_DB (-0.8), parâmetros do
  limiter, ceiling do master-out, thresholds do governor, 22 estratégias de fallback do yt-dlp.
