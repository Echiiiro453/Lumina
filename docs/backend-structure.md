# Estrutura do Backend

## Visão geral

O backend fica em `backend/` e usa Python/FastAPI. Ele serve APIs, WebSocket, arquivos estáticos, downloads, streaming, biblioteca, configurações, mobile, studio, tags e build desktop.

## Estrutura principal

- `main.py`: aplicação FastAPI principal, routers, WebSocket, endpoints legados/centrais e inicialização.
- `downloader.py`: fila de downloads, yt-dlp, estratégias/fallbacks, FFmpeg, metadados e banco.
- `database.py`: SQLite, downloads, favoritos, settings, fila persistida e sync com disco.
- `routers/`: rotas modulares.
- `static/`: frontend compilado e assets servidos.
- `build_exe.py`: empacotamento PyInstaller.
- `backend_tray.py`: provável entrada desktop/tray.
- `utils.py`, `config.py`: paths/configuração.
- `metadata_fetcher.py`, `lyrics_fetcher.py`, `tag_editor.py`: metadados, letras e tags.
- `magic_parsers.py`, `downtify_spotify.py`, `sunnify_api.py`: integrações/resolução externa.
- `deno_manager.py`, `bgutil_server/`, `po_token/`: helpers YouTube/SABR/PO Token.

## `backend/main.py`

Papel atual:

- cria o app FastAPI;
- inclui routers (`downloads`, `library`, `settings`, `mobile`, `studio`, `stream`);
- serve WebSocket `/ws`;
- inicializa tarefas de startup/shutdown;
- mantém endpoints diretos de logs, update, termos, presets, tags, biblioteca, histórico, mobile, downloads zip, miniplayer, voz, conversão e outros;
- contém endpoints que se sobrepõem a routers em alguns casos.

Risco: por conter rotas antigas e novas no mesmo arquivo, mudanças podem gerar duplicação ou conflitos de contrato.

## Routers

- `backend/routers/downloads.py`: `/download`, `/download/enqueue`, retry, cancelamento, status, jobs e abrir pasta.
- `backend/routers/stream.py`: busca, resolução de stream, proxy, info e detalhes de playlist. Observação: há definições duplicadas de `StreamDownloadRequest` e `/info` no arquivo.
- `backend/routers/library.py`: favoritos, histórico, biblioteca e inscrições.
- `backend/routers/settings.py`: download folder, concorrência, startup, Last.fm e Telegram.
- `backend/routers/mobile.py`: token mobile, listagem/zip/download mobile.
- `backend/routers/studio.py`: Demucs/stems, jobs e instalação.

## `backend/downloader.py`

Responsável por:

- `JobState`;
- `jobs` em memória;
- `download_queue`;
- semáforos de concorrência;
- opções yt-dlp por modo/qualidade;
- FFmpeg e postprocessors;
- cookies;
- fallbacks/estratégias YouTube/SABR;
- progress hook;
- rename/cleanup parcial;
- trim;
- metadados/capas;
- lyrics;
- registro no banco;
- timeout e cancelamento por status.

Estados observados:

- `queued`
- `running`
- `downloading`
- `processing`
- `retry_method_N`
- `done`
- `error`
- `timeout`
- `cancelled`
- `rate_limited`

## Banco/local state

`backend/database.py` usa SQLite em `DB_PATH = os.path.join(get_data_dir(), "downloads.db")`.

Tabelas criadas:

- `downloads`
- `app_settings`
- `favorites`
- `jobs_queue`

Também há sync com disco para marcar ausentes e importar arquivos locais órfãos.

## Helpers externos

- `backend/bgutil_server/`: helper BGUtil/SABR/PO Token, com Node/TypeScript/Deno.
- `backend/po_token/`: helper Node para geração de token.
- `backend/deno/`: runtime/local Deno, tratado como local/cache.
- `backend/spotifydownload/`, `backend/SpotiFLAC/`, `backend/sunnify-spotify-downloader/`: projetos terceiros/integrados.

## Pastas runtime local

- `backend/downloads/`: mídia baixada pelo usuário.
- banco SQLite em data dir ou `downloads.db`.
- caches de yt-dlp/Deno/Node, quando existirem.
- `backend/test_out/`, `backend/split_output/`, se gerados.

## Pastas build/cache

- `backend/static/`: build Vite servido pelo backend.
- `backend/dist/`: executável PyInstaller.
- `backend/build/`: build PyInstaller.
- `backend/*.exe_extracted/`: inspeção/extração de executáveis.
- `__pycache__/`

## Endpoints principais observados

Download:

- `POST /download`
- `POST /download/enqueue`
- `POST /download/retry`
- `POST /download/cancel/{job_id}`
- `GET /download/status/{job_id}`
- `GET /download/jobs`

Busca/stream/info:

- `POST /search`
- `POST /info`
- `POST /playlist/details`
- `POST /api/stream/resolve`
- `POST /api/stream/playlist`
- `POST /api/stream/artist`
- `GET /api/stream/proxy`

Biblioteca:

- `GET /api/library`
- `GET /api/history`
- `DELETE /api/history/{video_id}`
- `GET/POST/DELETE /api/favorites`

Configurações:

- `/api/settings/*`
- `/auth_status`
- `/upload_cookies`

Outros:

- `/ws`
- `/api/tags/*`
- `/api/studio/*`
- `/api/mobile/*`
- `/api/downloads/*`
- `/api/miniplayer/*`
- `/api/voice/*`
- `/api/convert`

## Build desktop

`backend/build_exe.py` empacota `backend_tray.py` com PyInstaller e adiciona binários/dados como `ffmpeg.exe`, `ffprobe.exe`, `aria2c.exe`, `node.exe`, `static`, `bgutil_server`, Vosk e termos.

Há paths absolutos no script para Vosk, o que é risco para outra máquina.
