# Estrutura do Projeto

## Visão geral

Este documento descreve o estado atual do workspace do Lumina/youtubeMusicDownload. Ele não descreve uma arquitetura ideal; registra como o projeto está organizado hoje.

O repositório mistura código de produção, assets do frontend, backend Python, build desktop, helpers externos, arquivos arquivados, testes manuais e dados locais. Algumas pastas são parte direta do runtime; outras existem para manutenção, build, experimentação ou histórico.

## Pastas principais

### `frontend/`

Aplicação React/Vite. Contém o código da interface, player, modais, fila visual, chamadas HTTP/WebSocket para o backend, configuração ESLint/Tailwind e assets usados no desenvolvimento.

Produção principal:

- `frontend/src/`
- `frontend/src/components/`
- `frontend/src/audio/`
- `frontend/src/utils/`
- `frontend/public/`

Também existem arquivos de backup e scripts soltos dentro de `frontend/src/`, como `App.jsx.backup*` e `refactor*.py`. Eles não parecem fazer parte do runtime atual.

### `backend/`

Backend Python/FastAPI, build desktop, downloader, banco SQLite, integrações e arquivos estáticos servidos pelo app. É a área mais sensível do projeto porque concentra API, downloads, streaming, biblioteca, PyInstaller e helpers externos.

Produção principal:

- `backend/main.py`
- `backend/downloader.py`
- `backend/routers/`
- `backend/database.py`
- `backend/utils.py`
- `backend/static/`

### `backend/static/`

Saída do build Vite e cópia servida pelo backend/executável. O `frontend/vite.config.js` usa:

```txt
build.outDir = ../backend/static
emptyOutDir = true
```

Portanto, `npm run build` dentro de `frontend/` apaga e recria essa pasta. Ela contém `index.html`, assets gerados e cópias dos AudioWorklets/HTMLs de teste vindos de `frontend/public`.

Não editar manualmente sem entender que o próximo build pode sobrescrever.

### `frontend/public/`

Assets públicos usados no desenvolvimento Vite. Inclui arquivos produtivos reais:

- AudioWorklets `*-processor.js`;
- testes HTML de áudio;
- impulse responses em `frontend/public/irs/`;
- favicon e `vite.svg`.

Os AudioWorklets aqui são código de produção, não bundle descartável.

### `tools/`

Scripts de manutenção e inspeção organizados após a higiene estrutural. Não são importados pelo runtime do app.

Exemplos:

- `tools/frontend-maintenance/`
- `tools/backend-maintenance/`
- `tools/executable-inspection/`

### `archive/`

Arquivos antigos, patches e fragmentos mantidos versionados para referência. Não devem ser tratados como runtime atual.

Exemplos:

- `archive/backend-patches/`
- `archive/frontend-fragments/`
- `archive/old_main.py`

### `tests/manual/`

Testes manuais e resultados históricos. Não é uma suíte automatizada de CI no estado atual.

Exemplos:

- `tests/manual/download/`
- `tests/manual/results/`

### `docs/`

Documentação técnica do projeto. Além destes Markdown, existem `docs/index.html` e `docs/styles.css`, que parecem documentação estática/local.

### `backend/bgutil_server/`

Helper externo para BGUtil/PO Token/SABR. Contém código Node/TypeScript/Deno, `package.json`, `deno.lock`, scripts e fonte própria. É runtime sensível para fluxos YouTube/SABR.

### `backend/po_token/`

Helper Node para geração de PO Token. Contém `generate.js` e dependências Node.

### `backend/SpotiFLAC/`, `backend/spotifydownload/`, `backend/sunnify-spotify-downloader/`

Projetos/integrações terceiros ou auxiliares misturados dentro de `backend/`. Pelo estado atual, devem ser tratados como vendor/helper e não como parte simples do backend FastAPI principal.

## Arquivos críticos

Não tocar sem validação ampla:

- `frontend/src/App.jsx`: tela principal, busca, download, fila visual, estado global e integração com backend.
- `frontend/src/components/PlayerBar.jsx`: player WebAudio, DSP, AudioWorklets, diagnósticos, presets e reprodução.
- `frontend/src/components/AudioDiagnosticsPanel.jsx`: painel de diagnóstico e testes de áudio.
- `frontend/src/utils/audioTortureRunner.js`: suíte offline de regressão DSP.
- `frontend/src/audio/presets/autoCalibrationProfiles.js`: fonte atual dos perfis de Auto-Calibração.
- `frontend/public/*-processor.js`: AudioWorklets produtivos.
- `backend/main.py`: aplicação FastAPI, WebSocket, endpoints e integração desktop.
- `backend/downloader.py`: fila de download, yt-dlp, FFmpeg, fallbacks e metadados.
- `backend/routers/`: rotas modulares novas/atuais.
- `backend/build_exe.py`: empacotamento PyInstaller.
- `backend/static/`: build servido pelo backend.
- `backend/bgutil_server/` e `backend/po_token/`: helpers YouTube/PO Token/SABR.

## Arquivos gerados

Exemplos observados ou esperados:

- `backend/static/assets/index-*.js`
- `backend/static/assets/index-*.css`
- `backend/dist/`
- `backend/build/`
- `backend/*.exe_extracted/`
- `backend/bgutil_server/tsconfig.tsbuildinfo`
- `backend/output.json`
- `frontend/node_modules/`
- `frontend/.vite/` ou `**/.vite/`
- `coverage/`
- `*.tmp`, `*.temp`, `*.tsbuildinfo`

## Arquivos sensíveis/locais

Devem ser tratados como dados locais e não documentação pública:

- `cookies.txt` na raiz ou em subpastas.
- `backend/downloads/`.
- `backend/downloads.db` ou banco em diretório de dados retornado por `get_data_dir()`.
- logs com URLs assinadas, paths locais, cookies ou tokens.
- `backend/output.json`, se contiver saída de ferramentas/token.
- wallpapers e arquivos pessoais.

## Observações

- Há duplicação entre `frontend/public` e `backend/static`; ela é esperada após build Vite.
- Há endpoints duplicados ou sobrepostos entre `backend/main.py` e alguns routers. Isso deve ser revisado com cuidado antes de refatorar.
- Há arquivos antigos e projetos externos dentro do backend. Movê-los exige validação do executável final.
- O projeto atualmente tem worktree com muitas mudanças em andamento; esta documentação registra o estado observado, não necessariamente um release limpo.
