# Riscos do Código e Melhorias Propostas

> **Escopo.** Este documento consolida os riscos reais encontrados por leitura direta do
> código-fonte do Lumina/youtubeMusicDownload, **atrelando cada risco à documentação
> técnica existente** em `docs/` e propondo melhorias concretas no nível do código.
>
> **Regra de ouro.** Nenhuma proposta aqui foi aplicada. O objetivo é servir de base
> para PRs pequenas e revisáveis. Onde houver conflito entre documentação e código,
> o conflito está registrado explicitamente com `⚠️`.
>
> **Severidade.**
> - 🔴 **Crítico** — vaza dados sensíveis, quebra funcionalidade principal ou impede build em outra máquina.
> - 🟠 **Alto** — bug real confirmado, perda de dados, vazamento de memória ou divergência de contrato que já afeta o usuário.
> - 🟡 **Médio** — fragilidade latente, mau cheiro, ou divergência doc↔código que pode induzir refactor errado.
> - 🟢 **Baixo** — ruído, maintenance debt, melhorias de clareza.
>
> Cada risco traz: `Local`, `Doc. de referência`, `O que acontece` e `Melhoria proposta`.

---

## Índice

1. [Segurança e dados locais](#1--segurança-e-dados-locais)
2. [Contratos de API e rotas duplicadas](#2--contratos-de-api-e-rotas-duplicadas)
3. [Bugs confirmados (backend)](#3--bugs-confirmados-backend)
4. [Bugs confirmados (frontend / DSP)](#4--bugs-confirmados-frontend--dsp)
5. [Player / cadeia WebAudio](#5--player--cadeia-webaudio)
6. [Logs, telemetria e performance de UI](#6--logs-telemetria-e-performance-de-ui)
7. [Download, fila e yt-dlp](#7--download-fila-e-yt-dlp)
8. [Build, empacotamento e runtime](#8--build-empacotamento-e-runtime)
9. [Testes e falso-positivo](#9--testes-e-falso-positivo)
10. [Matriz de cobertura: risco × documentação](#10--matriz-de-cobertura-risco--documentação)
11. [Plano de melhorias priorizado](#11--plano-de-melhorias-priorizado)
12. [O que NÃO mudar (invariáveis de segurança do som)](#12--o-que-não-mudar-invariáveis-de-segurança-do-som)

---

## 1. 🔴 Segurança e dados locais

### R1.1 — Path traversal em endpoints que recebem `file_path`/`files` 🔴
- **Local**: `backend/main.py` `/api/open_external` (1117), `/api/play_external` (1134),
  `/api/convert` (797 e 1348), `/api/track_metadata` (1513), `/api/tags/save` (512),
  `/api/fix_metadata` (1237), `/api/downloads/zip/start` (1688 — `downloads_dir + filename`),
  `/api/spectral-analysis` (992).
- **Doc. de referência**: `docs/runtime-data-and-security.md` → “Paths locais e path
  traversal” e “APIs que recebem `file_path`”.
- **O que acontece**: a maioria só faz `os.path.exists()` (ou `os.path.abspath`) sem
  verificar se o caminho está dentro de `get_downloads_dir()`. Um `file_path` com `..`
  ou absoluto permite ler/abrir/zipar/converter arquivos arbitrários do usuário.
  `/api/play_external` (1134) ainda transmite o `file_path` absoluto por WebSocket.
- **Melhoria proposta**: criar helper de validação único em `utils.py`:
  ```python
  def safe_resolve(file_path: str, root: str | None = None) -> str:
      root = root or get_downloads_dir()
      abs_path = os.path.realpath(os.path.join(root, file_path))
      if os.path.commonpath([abs_path, os.path.realpath(root)]) != os.path.realpath(root):
          raise HTTPException(403, "Caminho fora da biblioteca")
      if not os.path.isfile(abs_path):
          raise HTTPException(404, "Arquivo não encontrado")
      return abs_path
  ```
  Usar em todos os endpoints listados. **PR única, só segurança, sem mudar payload público.**

### R1.2 — Subprocess de FFmpeg sem timeout 🔴
- **Local**: `main.py` `/api/convert` (797 async, 1348 sync), `_run_ffprobe` (872),
  `/api/open_external` (1127). Apenas `/api/spectral-analysis` (1032) tem `timeout=60`.
- **Doc.**: `docs/runtime-data-and-security.md` → “FFmpeg/FFprobe” e checklist “usar timeout”.
- **O que acontece**: arquivo malformado/gigante trava o worker indefinidamente (consome CPU/RAM).
- **Melhoria**: impor `timeout=` em todos os `subprocess.run`/`create_subprocess_exec`
  e tratar `TimeoutExpired` com `process.kill()` + mensagem resumida (não stderr bruto).

### R1.3 — Cookies sem validação de conteúdo no upload 🟠
- **Local**: `main.py:725` (`/upload_cookies`) copia `shutil.copyfileobj` direto; o check
  de header Netscape só existe em `/auth_status` (708), não no upload.
- **Doc.**: `docs/runtime-data-and-security.md` → “Cookies e autenticação”.
- **O que acontece**: arquivo inválido/grande/lixeira vira `cookies.txt` silenciosamente;
  a UI só descobre quando o yt-dlp falha.
- **Melhoria**: no upload, ler primeiros bytes, validar header `# Netscape HTTP Cookie File`
  antes de persistir; rejeitar > 2 MB; **nunca** logar/printar conteúdo.

### R1.4 — Risco de cookies empacotados no exe 🟠
- **Local**: `utils.py:94` (`get_cookies_path`) aceita `_MEIPASS/cookies.txt` como fallback;
  `build_exe.py` não exclui cookies do `--add-data`.
- **Doc.**: `docs/known-risks.md` → “Segurança/local” e `docs/build-and-runtime.md`.
- **O que acontece**: se alguém deixar `cookies.txt` ao lado do fonte na hora do build,
  ele é embutido e vaza a sessão dentro do `Lumina.exe`.
- **Melhoria**: em `build_exe.py`, adicionar `.spec`-exclude ou `--add-data` explícito
  (sem cookies); e preferir `get_data_dir()/cookies.txt` exclusivamente (remover fallback
  `_MEIPASS`). Documentar que cookies ficam só no data dir do usuário.

### R1.5 — stderr/stdout de yt-dlp e FFmpeg podem vazar paths 🟡
- **Local**: `downloader.py:178-185` (`StdoutLogger`) imprime warnings/errors do yt-dlp;
  `main.py` `LogInterceptor` (136-166) filtrou parte do ruído yt-dlp mas não paths.
- **Doc.**: `docs/runtime-data-and-security.md` → “Dados que não podem ir para logs”.
- **Melhoria**: sanitizar stderr de subprocess antes de logar (trocar paths absolutos por
  `…/<basename>`); nunca expor `file_path` absoluto em resposta pública (`/api/play_external`).

---

## 2. 🟠 Contratos de API e rotas duplicadas

### R2.1 — ~22 rotas duplicadas entre `main.py` e routers 🟠
- **Local** (lado a lado):
  - Favoritos/history/library/subscriptions: `main.py:430/1193/1171/383-403` ↔ `routers/library.py:16/34/62/101-121`.
  - `/download/jobs`, `/open_folder`: `main.py:370/664` ↔ `routers/downloads.py:80/84`.
  - **Mobile inteiro (9 rotas)**: `main.py:1609-1764` ↔ `routers/mobile.py:20-196`.
- **Doc.**: `docs/api-contracts.md` → “Endpoints duplicados ou suspeitos” e
  `docs/known-risks.md` → “Arquitetura”.
- **O que acontece**: a versão registrada por último “ganha”; ordem depende de import/source.
  No mobile, **cada lado tem o próprio `mobile_tokens`/`zip_jobs` em memória** — um token
  criado pela rota do router é invisível à rota do main e vice-versa.
- **Melhoria**: mover as rotas de `main.py` para os routers por domínio, **um domínio por
  PR**, removendo a duplicata de `main.py` só depois de confirmar (via mapa de rotas
  antes/depois + smoke) que o router é o que já roda. Para mobile, unificar o store.

### R2.2 — Duplicação interna de definições (mesmo arquivo) 🟠
- **Local**:
  - `routers/stream.py`: `StreamDownloadRequest` (545 e 735), `@router.post("/info")`
    (554 e 740), `@router.post("/playlist/details")` (658 e 849).
  - `routers/studio.py`: `@router.post("/api/studio/install")` (218 e 331).
  - `main.py`: `ConvertRequest` (793 e 1283), `/api/convert` (797 e 1348),
    `/api/choose_file` (776 e 1287).
- **Doc.**: `docs/api-contracts.md` → “Contratos frágeis”.
- **O que acontece**: a 2ª definição sempre sobrescreve a 1ª silenciosamente. A 2ª `/info`
  (740) usa `web_sabr` + bgutil base-url; quem lê o topo do arquivo acha que é outra.
- **Melhoria**: deletar a definição perdedora de cada par; registrar em teste que
  `len(router.routes)` não cresce. PR separada por arquivo.

### R2.3 — Hook `useDownloadStatus` chama endpoint inexistente `/ws/download/{jobId}` 🟡
- **Local**: `frontend/src/hooks/useDownloadStatus.js:13`.
- **Doc.**: `docs/api-contracts.md` → “Contrato suspeito `/ws/download/{jobId}`”.
- **O que acontece**: endpoint não existe no backend (só há `/ws` global). O hook **não é
  importado em nenhum lugar** (confirmado por grep) — é código morto.
- **Melhoria**: **deletar** o hook (fase de higiene), ou, se for ressuscitar, implementar o
  endpoint no backend e adicionar import. Hoje ele só confunde quem lê a pasta `hooks/`.

### R2.4 — Erros sempre retornam só `detail`/string genérica 🟡 ✅ resolvido (PR 6.4)
- **Local**: `downloader.py:596-599` (error final), diversos `HTTPException(detail=...)`.
- **Doc.**: `docs/api-contracts.md` → “Riscos ao alterar contratos”.
- **O que acontece**: UI não consegue distinguir 403/429/cookies inválidos/IP bloqueado —
  todos viram mensagem genérica; `App.jsx:534` até cola uma dica fixa sobre cookies.
- **Melhoria**: padronizar `{"detail": str, "code": "AUTH_REQUIRED|RATE_LIMITED|FORMAT_NOT_FOUND|…"}`
  preservando o campo `detail` antigo (compat).
- **Resolução (PR 6.4)**: adicionado `error_code: Optional[str]` ao `JobState`
  (`downloader.py`), setado em todos os pontos de falha classificados (AUTH_REQUIRED,
  RATE_LIMITED, FORMAT_NOT_FOUND, DOWNLOAD_FAILED, TIMEOUT, CANCELLED, UNKNOWN) —
  `classify_error()` mapeia free-text → code reaproveitando TRANSIENT/LOGIN/FORMAT, e
  `last_code` persiste o motivo real durante os retries. Como `JobState` é serializado por
  `asdict()`, o campo aparece no payload sem mudar os routers. Para erros síncronos,
  handler global em `main.py` devolve `{"detail", "code"}` (lê `X-Error-Code` setado por
  `utils.raise_with_code`); `code=None` quando não classificado → 100% retrocompatível.
  No frontend, `App.jsx` agora ramifica a dica por `job.error_code` (`errorHint()`), em vez
  de chutar pela ausência de login. i18n pt+en adicionados; demais idiomas caem no fallback
  pt (DEFAULT_LANG). `detail`/`error` (free-text) preservados.

### R2.5 — `done` (backend) vs `completed`/`pending` (UI) 🟡
- **Local**: `downloader.py` usa `done`; `App.jsx` fila usa `pending`/`completed`; o
  `memory_reaper` (`downloader.py:62`) checa `completed` que **nunca é setado**.
- **Doc.**: `docs/download-flow.md` → “Estados possíveis” e `docs/api-contracts.md` →
  “Estados de download”.
- **Melhoria**: padronizar com compat (UI aceita `done` **e** `completed`); corrigir o
  `memory_reaper` para `done` (ver R3.1).

---

## 3. 🟠 Bugs confirmados (backend)

### R3.1 — `memory_reaper` nunca limpa jobs concluídos 🟠
- **Local**: `downloader.py:55-71`.
- **O que acontece**: o reaper filtra `status in ["completed","error","cancelled","rate_limited"]`,
  mas o downloader seta `done` (nunca `completed`). Logo, jobs `done` só saem de RAM
  se forem `error`/`cancelled` — `jobs` cresce por sessões longas.
- **Doc.**: `docs/known-risks.md` → “Player/DSP” menciona leaks; este é leak de estado no backend.
- **Melhoria**:
  ```python
  FINAL_STATES = {"done", "error", "cancelled", "rate_limited", "timeout"}
  if st.status in FINAL_STATES and now - st.last_update > 43200: ...
  ```

### R3.2 — Assinatura de `add_favorite` não bate com o chamador 🟠
- **Local**: `routers/library.py:21` chama
  `add_favorite(req.video_id, req.title, req.channel, req.duration, req.thumbnail)`
  (5 args, via `FavoriteRequest`), mas `database.py:63` define
  `add_favorite(video_id, title, file_path)` (3 args).
- **O que acontece**: `TypeError` ao favoritar pela rota do router. (A rota vencedora
  em runtime é provavelmente a do `main.py:434`, que passa 3 args; por isso não explode
  em produção — mas é mina terrestre quando a duplicata R2.1 for resolvida.)
- **Doc.**: `docs/api-contracts.md` → Favorites payload.
- **Melhoria**: alinhar `database.add_favorite` ao schema do Pydantic (`video_id, title,
  channel, duration, thumbnail, file_path`) **ou** reduzir o `FavoriteRequest`. Definir o
  schema único antes de mover favoritos para router.

### R3.3 — Concorrência desalinhada (4 / 8 / 20) 🟡
- **Local**: `downloader.py:48` `MAX_CONCURRENT_DOWNLOADS=4` + `download_sem=Semaphore(4)`;
  `routers/settings.py:25` permite `max(1, min(8, value))`; `main.py:318` spawna **20**
  `worker_loop` fixos.
- **Doc.**: `docs/backend-structure.md` → semáforos de concorrência.
- **O que acontece**: setting de 8 só troca o semáforo em runtime (`settings.py:32`), mas
  20 workers fixos competem; o limite real é o menor. Difícil raciocinar sobre throughput.
- **Melhoria**: derivar nº de workers do valor do semáforo no startup; expor e documentar
  o limite efetivo.

### R3.4 — `/api/library` e `/api/history` chamam `sync_db_with_disk` a cada GET 🟡
- **Local**: `routers/library.py:38` e `:66` (e equivalentes em `main.py`).
- **O que acontece**: cada listagem varre `downloads/` recursivamente (walk + stat de tudo),
  importando órfãos. Em bibliotecas grandes = latência alta em cada refresh.
- **Doc.**: `docs/backend-structure.md` → sync com disco.
- **Melhoria**: separar `/api/db/sync` (manual/periódico) do GET de listagem; cachear a
  última sync por tempo (ex: máx 1 sync a cada 30s).

---

## 4. 🟠 Bugs confirmados (frontend / DSP)

### R4.1 — `audioLagProbe` forçado em produção 🟠
- **Local**: `frontend/src/utils/audioLagProbe.js:1` `const ENABLED = true; // Forced via
  code for testing`.
- **O que acontece**: instrumentação de render/interval/rAF/portMessages fica sempre ativa,
  incrementando contadores em cada render (`AudioDiagnosticsPanel.jsx:61`, `PlayerBar.jsx`
  em dezenas de pontos). Custo de perf contínuo e poluição de `window.__LUMINA_AUDIO_LAG_PROBE__`.
- **Doc.**: `docs/diagnostics-and-tests.md` (não prevê o “forced”); `docs/known-risks.md`
  → “Player/DSP: Logs/telemetria em alta frequência”.
- **Melhoria**: ler `localStorage.getItem('lumina.debugAudioLagProbe')` (que `main.jsx`
  já seta quando necessário) e default `false`; remover o `ENABLED = true` hardcoded.

### R4.2 — Flags de debug forçadas em `main.jsx` 🟠
- **Local**: `frontend/src/main.jsx:7-8`:
  ```js
  localStorage.setItem('lumina.debugAudioLagProbe', '1');
  localStorage.setItem('lumina.disableWorkletTelemetry', '1');
  ```
- **O que acontece**: em **todo** build de produção o `disableWorkletTelemetry` fica ON e o
  probe fica ON. Comportamento de dev colado no bootstrap.
- **Melhoria**: mover para um dev-only (`import.meta.env.DEV`) ou remover, deixando o toggle
  só na Settings/diagnóstico.

### R4.3 — rAF órfão em `AudioDiagnosticsPanel.drawCurve` 🟠
- **Local**: `AudioDiagnosticsPanel.jsx:598` agenda o próximo frame no **topo** e `:752`
  agenda de novo no **fim**. O cleanup só cancela o 2º id.
- **O que acontece**: a cada ciclo fica 1 rAF não cancelado; acumula enquanto o painel abre.
- **Doc.**: `docs/diagnostics-and-tests.md`.
- **Melhoria**: agendar só uma vez (no fim do corpo) e guardar o id único.

### R4.4 — `setLufsValue` (setState) dentro de callback de worklet 🟠
- **Local**: `PlayerBar.jsx:1573` (`lufsNode.port.onmessage → setLufsValue`).
- **O que acontece**: o worklet posta ~10x/s (`lufs-meter-processor.js:80`); cada mensagem
  dispara `setState` → re-render do player. Diferente dos outros telemetry, que usam **ref**.
- **Doc.**: `docs/audio-pipeline.md` → “Telemetria”.
- **Melhoria**: guardar LUFS num ref como os demais, e ler via poll do `AudioDiagnosticsPanel`.

### R4.5 — `drawVisualizer` rAF roda desde o mount 🟡
- **Local**: `PlayerBar.jsx:1922` — agenda frame contínuo mesmo antes do `analyserRef`
  existir (`:1925` mantém o loop).
- **Melhoria**: só rodar quando `audioContextRef.current && analyserRef.current`.

### R4.6 — Troca de faixa não reseta estados DSP 🟡
- **Local**: `PlayerBar.jsx:1971` (effect de `currentSong`) só posta `{type:'reset'}` ao
  `truePeakNode` (`:2032`); **não** chama `resetAllDspStates` nem ducka `seekGate`.
- **O que acontece**: caudas de filtro/envelope (deesser, deharsh, saturation, depth, etc.)
  podem “vazar” da faixa anterior para a próxima no início.
- **Doc.**: `docs/audio-pipeline.md` → “Seek/troca de faixa exige reset consistente”
  (`docs/known-risks.md`).
- **Melhoria**: ao trocar de faixa, chamar `resetAllDspStates('track')` (igual ao seek).
  ⚠️ **Sensível a som** — PR isolada + testes de regressão (Auto-Calib / Bass Torture).

### R4.7 — Worklets sem handler de `{type:'reset'}` 🟡
- **Local**: só `master-out-processor.js` (47-51) e `saturation-processor.js` (47-56)
  implementam reset. Os outros 16 não.
- **O que acontece**: ao receber `{type:'reset', reason}` (postado por `resetAllDspStates`),
  esses worklets simplesmente ignoram — estados internos não são zerados.
- **Doc.**: `docs/audio-pipeline.md` → reset de cauda.
- **Melhoria**: adicionar handler de reset nos worklets que têm estado (deesser envelope,
  deharsh, depth delay, crossfeed delay, spatial8d, room-telemetry, source-quality counters).
  **Um worklet por PR**, com teste offline antes/depois.

### R4.8 — `stereo-scope` ignora `setTelemetryEnabled` 🟡
- **Local**: `stereo-scope-processor.js` atribui `port.onmessage` **duas vezes** (`:5`
  depois `:15`); a 2ª sobrescreve a 1ª e o branch `setTelemetryEnabled` fica inalcançável.
- **Doc.**: `docs/audio-pipeline.md` → telemetria.
- **Melhoria**: unificar o handler num só `port.onmessage`.

### R4.9 — `lufs-meter` posta telemetria sem gate e pode mandar `-Infinity` 🟡
- **Local**: `lufs-meter-processor.js:80-85` posta `{lufs}` sem checar `telemetryEnabled`
  e sem clamp; quando `meanSq <= 1e-10` (silêncio) `lufs = -Infinity`.
- **Melhoria**: gatear por `telemetryEnabled`, clampar `lufs` (ex: `max(lufs, -70)`),
  incluir `type:'telemetry', name:'LUFS'`.

---

## 5. 🟠 Player / cadeia WebAudio

### R5.1 — `PlayerBar.jsx` monolítico (2849 linhas) 🔴-tamanho
- **Local**: grafo (`initAudioVisualizer` ~1152-1920), governor (1631-1799), seek (2130-2163).
- **Doc.**: `docs/refactor-roadmap.md` → Fase 6; `docs/known-risks.md` → “Player/DSP”.
- **Melhoria**: extrair hooks pequenos preservando **ordem da cadeia, presets, headroom,
  limiter e Peak Guard** — `useAudioEngine`, `useDSPTelemetry`, `usePerformanceGovernor`,
  `useSeekTransition`. **Um hook por PR.** ⚠️ Sensível a som.

### R5.2 — Reconstrução do grafo sem rollback 🟡
- **Local**: `PlayerBar.jsx:1153` (`if (audioContextRef.current) return`) guarda contra
  rebuild, mas `initAudioVisualizer` não tem try/finally; se uma exceção ocorrer depois de
  criar nós/`addModule`/`ditherSrc.start()`, ficam nós órfãos.
- **Doc.**: `docs/known-risks.md` → “Player/DSP: Longa duração pode revelar leaks”.
- **Melhoria**: envolver em try/catch que faz `disconnect()` dos nós já criados em caso de erro.

### R5.3 — `addModule` com cache-buster fora do dedup 🟢
- **Local**: `PlayerBar.jsx:1181` (source-quality) e `:1454` (room-telemetry) usam
  `?v=Date.now()` fora do `loadModule`. Seguro hoje (guard de init único), mas `addModule`
  duplicado para o mesmo processor **lança `NotSupportedError`**.
- **Melhoria**: passar ambos pelo `loadModule` (que tem dedup via `loadedModulesRef`).

### R5.4 — `clipCount` do master-out é por janela, não cumulativo 🟡
- **Local**: `master-out-processor.js:226-230` zera `clipCount` a cada 0,5s junto com o peak.
- **O que acontece**: a UI lê `clipCount` como total; “clips acumulados” está errado.
- **Doc.**: `docs/diagnostics-and-tests.md` → clip count.
- **Melhoria**: manter `clipCount` cumulativo e expor `windowClipCount` separado; resetar
  só via `{type:'resetClips'}` (que já existe, `:52`).

---

## 6. 🟡 Logs, telemetria e performance de UI

### R6.1 — `audioLogsDisabled`/`telemetryThrottled` são constantes, não medidos 🟡
- **Local**: `healthSnapshot.js:112-113` declara sempre `true`.
- **Doc.**: `docs/diagnostics-and-tests.md` → health snapshot.
- **O que acontece**: relatórios de health soak podem afirmar que logs estão desabilitados
  quando não estão — falso na exportação.
- **Melhoria**: derivar do estado real (flag do logger / contadores do probe).

### R6.2 — `SettingsModal.toggleVoice` cria `setInterval` sem cleanup de unmount 🟡
- **Local**: `SettingsModal.jsx:75-91` (interval de 3s só limpa quando status ≠ downloading).
- **O que acontece**: fechar o modal durante download deixa o interval rodando e chamando
  setState em componente desmontado.
- **Melhoria**: guardar id num ref e limpar no cleanup do effect (ou `useEffect` dedicado).

### R6.3 — `StudioModal` install poll sem cleanup 🟡
- **Local**: `StudioModal.jsx:118` `setInterval` só limpa em success/error.
- **Melhoria**: id em ref + limpeza no unmount.

### R6.4 — `LogViewerModal` faz poll 1.5s sem pausar em aba oculta 🟢
- **Local**: `LogViewerModal.jsx:31`.
- **Melhoria**: pausar com `document.visibilityState`.

### R6.5 — `App.jsx` POSTa progresso do miniplayer a cada `timeupdate` 🟡
- **Local**: `App.jsx:2061` (`handleTimeUpdate` → setProgress a ~4Hz) alimenta o effect de
  miniplayer (375) que faz POST ao backend a cada tick.
- **Melhoria**: throttle do POST (ex: máx 1/s) ou usar WebSocket outbound.

---

## 7. 🟡 Download, fila e yt-dlp

### R7.1 — Cancelamento depende do progress hook observar `cancelled` 🟡
- **Local**: `downloader.py:188` (`local_progress_hook`) levanta exceção só quando yt-dlp
  chama o hook; não mata subprocess/aria2c imediatamente.
- **Doc.**: `docs/download-flow.md` → “Riscos conhecidos”.
- **Melhoria**: ao cancelar, além de marcar status, encerrar processo ativo (guardar PID/Popen).

### R7.2 — `download_with_retries` classifica erro por substring de mensagem 🟡
- **Local**: `downloader.py:20-21` (`is_match`) contra strings em inglês hardcoded.
- **O que acontece**: mudança de wording do yt-dlp ou localização quebra a classificação
  (rate_limited vs login vs format).
- **Melhoria**: basear-se em exceções tipo `http.http_to_video`/`ExtractorError` quando
  possível; manter substring como fallback documentado.

### R7.3 — `.trimmed.tmp` pode sobrar 🟢
- **Local**: `downloader.py:482-511` — criado, e removido só nos caminhos de erro/empty.
- **Melhoria**: `try/finally` garantindo `os.remove(temp_trim_path)` se existir.

### R7.4 — Fallbacks muito longos mascaram regressão 🟡
- **Local**: `downloader.py:349-373` (22 estratégias, `sabr_live` → `proxy_survival`).
- **Doc.**: `docs/download-flow.md` → “Riscos conhecidos”, `docs/refactor-roadmap.md` Fase 4.
- **Melhoria**: logar/métricar quantas estratégias são tentadas; preferir falhar rápido
  quando `LOGIN_ERRORS` (já faz, `:585`) — estender para `rate_limited` repetido.

---

## 8. 🔴 Build, empacotamento e runtime

### R8.1 — Path absoluto para Vosk no `build_exe.py` 🔴
- **Local**: `build_exe.py:32`
  `"C:/Users/andrey/AppData/Local/Programs/Python/Python310/Lib/site-packages/vosk"`.
- **Doc.**: `docs/backend-structure.md` → “Build desktop”; `docs/known-risks.md` → Build.
- **O que acontece**: build quebra em **qualquer outra máquina** ou usuário.
- **Melhoria**: descobrir o path via `import vosk, os; os.path.dirname(vosk.__file__)`
  em runtime, ou usar `--collect-all vosk` (já presente, `:92`) e **remover** o `--add-data`
  absoluto.

### R8.2 — `backend/static` é frágil ao editar manualmente 🟠
- **Local**: `vite.config.js` (`outDir: '../backend/static', emptyOutDir:true`).
- **Doc.**: `docs/build-and-runtime.md` → “Risco: editar apenas `backend/static`”.
- **O que acontece**: edição direta em `backend/static/*-processor.js` ou `index.html`
  funciona até o próximo `npm run build`, que apaga tudo.
- **Melhoria**: nunca editar static; sempre `frontend/public` + `npm run build`. Adicionar
  pre-commit/CI que falhe se `backend/static` tiver diff sem `frontend/` diff correspondente.

### R8.3 — Sem SPA fallback real para deep links 🟡
- **Local**: `main.py:2069` só `StaticFiles(html=True)` (serve `index.html` em `/`, não em
  `/library` etc.).
- **Melhoria**: adicionar catch-all `@app.get("/{full_path:path}")` que retorna
  `index.html` quando não for arquivo/API/WS.

### R8.4 — CORS `allow_origins=["*"]` + `allow_credentials=True` 🟡
- **Local**: `main.py:82-90`. Combinação inválida pelo spec do CORS (credenciais + wildcard).
- **Melhoria**: listar origens explícitas quando `credentials=True`.

---

## 9. 🟡 Testes e falso-positivo

### R9.1 — `audioTortureRunner` cai para `createGain()` se worklet falha 🟠
- **Local**: `audioTortureRunner.js:151-154` (loadModule engole erro) e `:251/258/518/524`
  (fallback para ganho no-op).
- **Doc.**: `docs/diagnostics-and-tests.md` → “Possíveis falsos positivos”.
- **O que acontece**: um teste pode “passar” contra um limiter/dsp que **não existe** no
  grafo de teste.
- **Melhoria**: falhar alto se um worklet não carregar; distinguir “worklet ausente”
  de “passou”.

### R9.2 — Worklets carregados por path absoluto no runner 🟡
- **Local**: `audioTortureRunner.js:155-157, 434-435` (`/master-out-processor.js`).
- **O que acontece**: quebra sob qualquer `base` path diferente de `/`.
- **Melhoria**: resolver com `import.meta.env.BASE_URL`.

### R9.3 — Cobertura de testes não cobre build desktop nem player real 🟡
- **Doc.**: `docs/diagnostics-and-tests.md` → “O que não valida”; `docs/testing-checklist.md`.
- **Melhoria**: pipeline CI com `npm run lint`+`build`+runner offline; smoke manual documentado.

---

## 10. Matriz de cobertura: risco × documentação

Legenda: ✅ coberto pela doc · ⚠️ doc existe mas diverge do código · ❌ não coberto.

| Risco | `known-risks` | `runtime-data-and-security` | `api-contracts` | `audio-pipeline` | `diagnostics-and-tests` | `build-and-runtime` | `refactor-roadmap` |
|---|---|---|---|---|---|---|---|
| R1.1 traversal | — | ✅ | — | — | — | — | — |
| R1.2 subprocess timeout | — | ✅ | — | — | — | — | — |
| R1.3 cookies upload | — | ✅ | — | — | — | — | — |
| R1.4 cookies no exe | — | ✅ | — | — | — | ✅ | — |
| R1.5 stderr leak | — | ✅ | — | — | — | — | — |
| R2.1 rotas duplicadas | ✅ | — | ✅ | — | — | — | ✅ |
| R2.2 dup. interna | — | — | ✅ | — | — | — | — |
| R2.3 hook morto | — | — | ✅ | — | — | — | — |
| R2.4 erros genéricos | — | — | ✅ | — | — | — | ✅ |
| R2.5 estados download | — | — | ✅ | — | — | — | ✅ |
| R3.1 memory_reaper | ❌ | — | — | — | — | — | — |
| R3.2 add_favorite | ❌ | — | ⚠️ | — | — | — | — |
| R3.3 concorrência | ✅ | — | — | — | — | — | — |
| R3.4 sync a cada GET | ❌ | — | — | — | — | — | — |
| R4.1 probe forçado | ⚠️ | — | — | — | ⚠️ | — | — |
| R4.2 flags main.jsx | ❌ | — | — | — | — | — | — |
| R4.3 rAF órfão | ❌ | — | — | — | — | — | — |
| R4.4 setState LUFS | — | — | — | ✅ | — | — | — |
| R4.5 drawVisualizer | ❌ | — | — | — | — | — | — |
| R4.6 reset track-change | — | — | — | ✅ | — | — | — |
| R4.7 worklets sem reset | — | — | — | ✅ | — | — | — |
| R4.8 stereo-scope disable | ❌ | — | — | ✅ | — | — | — |
| R4.9 lufs Infinity | ❌ | — | — | — | — | — | — |
| R5.1 PlayerBar tamanho | ✅ | — | — | ✅ | — | — | ✅ |
| R5.2 rollback grafo | ❌ | — | — | — | — | — | — |
| R5.3 addModule dup | ❌ | — | — | — | — | — | — |
| R5.4 clipCount janela | ❌ | — | — | — | ✅ | — | — |
| R6.x logs/perf | ✅ | ✅ | — | ✅ | ✅ | — | ✅ |
| R7.x download | ✅ | — | ✅ | — | — | — | ✅ |
| R8.1 Vosk path | ✅ | — | — | — | — | ✅ | — |
| R8.2 static frágil | ✅ | — | — | — | — | ✅ | ✅ |
| R8.3 SPA fallback | ❌ | — | — | — | — | — | — |
| R8.4 CORS | ❌ | — | — | — | — | — | — |
| R9.1 teste falso-positivo | — | — | — | — | ✅ | — | — |

**Conclusão da matriz:** os riscos de **segurança** e **arquitetura** têm boa cobertura nos
docs; os **bugs funcionais pontuais** (R3.1, R3.2, R3.4, R4.2–R4.9, R5.2–R5.4, R8.3, R8.4)
**não estão** nos docs — são achados novos desta leitura e devem ser incorporados.

---

## 11. Plano de melhorias priorizado

Sequência alinhada ao `docs/refactor-roadmap.md`, **uma PR por tema**. Cada item cita o risco
(R-id), a fase do roadmap e se ⚠️ é sensível a som/download.

| # | Risco(s) | Ação | Fase | Sensível? |
|---|---|---|---|---|
| 1 | R8.1 | Remover path absoluto do Vosk em `build_exe.py` | 8 Build | Não |
| 2 | R2.3 | Deletar `useDownloadStatus.js` (código morto) | 1 Higiene | Não |
| 3 | R4.1, R4.2 | Desligar `audioLagProbe` forçado + flags em `main.jsx` (dev-only) | 2 Logs/telem | Não |
| 4 | R4.3 | Corrigir rAF duplo em `AudioDiagnosticsPanel.drawCurve` | 2 | Não |
| 5 | R4.8, R4.9 | Corrigir `stereo-scope` (disable) e `lufs-meter` (gate + clamp) | 2 | ⚠️ leve |
| 6 | R3.1 | `memory_reaper`: checar `done` (e estados finais) | 4 Download | Não |
| 7 | R3.2 | Alinhar `database.add_favorite` com o schema Pydantic | 3 Contratos | Não |
| 8 | R6.1 | `audioLogsDisabled`/`telemetryThrottled` reais em `healthSnapshot` | 2 | Não |
| 9 | R1.1, R1.2 | Helper `safe_resolve` + timeout em subprocess | — Segurança | Não |
| 10 | R1.3, R1.4 | Validar cookies no upload + não empacotar no exe | — Segurança | Não |
| 11 | R2.1, R2.2 | Mover/deletar rotas duplicadas, **um domínio por PR** | 5 Backend | Não |
| 12 | R4.7 | Adicionar `{type:'reset'}` aos worklets, **um por PR** | 7 DSP | ⚠️ sim |
| 13 | R4.6 | Reset de estados na troca de faixa | 6 Player | ⚠️ sim |
| 14 | R5.1 | Extrair hooks do `PlayerBar`, **um por PR** | 6 Player | ⚠️ sim |
| 15 | R9.1, R9.2 | `audioTortureRunner` falha alto + path relativo | 7 Testes | Não |
| 16 | R8.3, R8.4 | SPA catch-all + CORS fix | 8 Build | Não |
| 17 | R7.1, R7.2 | Cancelamento real + classificação de erro por exceção | 4 Download | Não |

**Validação obrigatória em toda PR de frontend:** `cd frontend && npm run build && npm run lint`.
Em PRs ⚠️ de DSP/player: adicionalmente rodar Auto-Calib + Bass Torture + Seek/Tail Reset no
`AudioDiagnosticsPanel` e validar som em playback real.

---

## 12. O que NÃO mudar (invariáveis de segurança do som)

Estes pontos **preservam o comportamento sonoro** e não devem ser alterados sem teste
exaustivo de regressão — referência rápida para qualquer PR das fases 6/7:

- **Ordem da cadeia** (R5/docs `audio-pipeline.md`): `… → EQ → preNode → DSP → postNode →
  exciter → depth → multibandWidth → reverb → masterSum → spectralGlue → mastering → lufs →
  spatial8d → abComparator → stereoScope → limiter → truePeakNode → destination`.
- **Posição do `limiterNode` e do `truePeakNode` (Peak Guard)**: limiter antes do master-out,
  master-out como **último nó** antes do destination.
- **Headroom floor de `-12 dB`** em `autoCalibrationProfiles.js:72`
  (`Math.max(-12, Math.min(0, effectiveExtraHeadroomDb))`).
- **`targetPeakDb = -2.0`** e **`dangerMarginDb = 0.8`** no `calculateAnticipativeHeadroom`.
- **`SEEK_TEMP_HEADROOM_DB = -0.8`** (`autoCalibrationProfiles.js:49`).
- **Parâmetros do limiter**: threshold ≈ `-1 dB`, ratio alto, attack/release curtos
  (`PlayerBar.jsx:1613`).
- **`ceiling = 10^(-1/20)`** no master-out (`master-out-processor.js:12`).
- **Thresholds do governor**: CRITICAL `cpuMs>2.5 || underruns>5`; MEDIUM `cpuMs>1.8 ||
  underruns>1` (`PlayerBar.jsx:1643-1650`); histerese 500ms/3s.
- **22 estratégias de fallback** do yt-dlp e sua **ordem** (`sabr_live` → `proxy_survival`)
  — só mudar com justificativa e teste de download real.
- **Contrato público de `JobState`** e estados (`done`, `error`, `cancelled`, `timeout`,
  `rate_limited`, `retry_method_N`).
- **Topologia do `autoEqIrStage`**: `wetGain → output` é **permanente**; só o gain varia
  (`autoEqIrStage.js:48`) — já foi bug fixado (commit `ffb7029`).

---

*Documento gerado a partir de leitura direta do código (rama `chore/project-hygiene-docs-lint-runtime`)
em 2026-06-27. Nenhuma alteração de código foi feita. Conflitos doc↔código estão marcados com ⚠️.*
