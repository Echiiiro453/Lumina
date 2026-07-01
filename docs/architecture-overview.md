# Visão Geral de Arquitetura

## Diagrama textual

```txt
Usuário
→ Frontend React/Vite
→ API backend Python/FastAPI
→ Download/Stream Resolver
→ yt-dlp / SABR / cookies / PO Token / fallbacks
→ Download temporário e conversão FFmpeg
→ Metadados, tags, capa e letras
→ Biblioteca local SQLite + pasta de downloads
→ Player WebAudio
→ DSP / AudioWorklets / diagnósticos
→ Saída de áudio
```

## Relação frontend/backend

O frontend React roda em Vite durante desenvolvimento e é compilado para `backend/static` no build de produção. O backend FastAPI serve APIs, WebSocket e arquivos estáticos. O frontend usa `axios`, `fetch` e WebSocket para falar com o backend.

Áreas principais de comunicação:

- busca e resolução: `/search`, `/info`, `/playlist/details`;
- download: `/download`, `/download/enqueue`, `/download/status/{job_id}`, `/download/jobs`, `/download/cancel/{job_id}`;
- progresso em tempo real: `/ws`;
- biblioteca/histórico/favoritos: `/api/library`, `/api/history`, `/api/favorites`;
- streaming: `/api/stream/*`;
- configurações: `/api/settings/*`;
- diagnóstico, tags, conversão, mobile e studio em endpoints próprios.

## App desktop

O backend contém `backend_tray.py`, `miniplayer.py`, `build_exe.py`, assets estáticos e scripts para empacotamento. O build desktop atual parece ser PyInstaller, com `backend/build_exe.py` gerando `backend/dist/Lumina.exe`.

Há também estrutura Tauri em `frontend/src-tauri/`, mas pelo estado atual o PyInstaller/backend Python parece ser o caminho principal documentado pelo script de build.

## Como download e reprodução se conectam

O download cria um job no backend, executa yt-dlp/FFmpeg, salva o arquivo em downloads e registra no SQLite. O frontend acompanha progresso via WebSocket e endpoints de status. Depois de concluído, o item pode ser tocado como arquivo local no `PlayerBar.jsx`, com `currentSong.file` apontando para o caminho salvo.

## Como o player se conecta ao backend

O player é majoritariamente frontend/WebAudio. Ele recebe músicas locais ou streams resolvidos pelo backend. Também envia/recebe dados auxiliares:

- scrobble/telemetria, conforme endpoints existentes;
- metadados de faixa;
- abertura externa/miniplayer;
- biblioteca/histórico;
- stream resolve/proxy quando usado.

## Principais dependências externas

- React 19, Vite, Tailwind, Framer Motion, Axios.
- FastAPI, Uvicorn, Pydantic.
- yt-dlp.
- FFmpeg/FFprobe/aria2c.
- curl_cffi/impersonation.
- mutagen para tags.
- SQLite.
- Deno/BGUtil/PO Token helpers.
- PyInstaller/PyWebView/camada desktop.
- Demucs/Torch/ShazamIO/Vosk para funções extras.

## Módulos críticos

- `frontend/src/App.jsx`
- `frontend/src/components/PlayerBar.jsx`
- `frontend/src/components/AudioDiagnosticsPanel.jsx`
- `frontend/src/utils/audioTortureRunner.js`
- `frontend/public/*-processor.js`
- `backend/main.py`
- `backend/downloader.py`
- `backend/routers/stream.py`
- `backend/routers/downloads.py`
- `backend/database.py`
- `backend/build_exe.py`
- `backend/bgutil_server/`
- `backend/po_token/`

## Módulos experimentais ou históricos

Hipótese baseada na localização/nome dos arquivos:

- `archive/`
- `frontend/src/App.jsx.backup*`
- `frontend/src/refactor*.py`
- `backend/insert_endpoint.ps1`
- projetos terceiros dentro de `backend/SpotiFLAC`, `backend/spotifydownload`, `backend/sunnify-spotify-downloader`.

## Pontos de acoplamento forte

- `frontend/public` e `backend/static` precisam ficar compatíveis.
- `App.jsx` conhece muitos endpoints e estados de download.
- `PlayerBar.jsx` concentra UI, playback, criação de nós WebAudio, DSP e telemetria.
- `downloader.py` mistura estratégia yt-dlp, FFmpeg, metadados, lyrics, banco e retries.
- `main.py` ainda contém muitas rotas além dos routers modulares.

## Riscos conhecidos de arquitetura

- Diferença entre desenvolvimento Vite e executável PyInstaller.
- Rotas duplicadas entre `main.py` e `backend/routers`.
- Estado assíncrono grande no frontend.
- Worklets produtivos tratados como assets públicos.
- Helpers externos dentro de `backend/` podem quebrar se movidos sem atualizar build.
