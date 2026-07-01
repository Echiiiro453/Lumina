# Contratos de API

## Visão geral

Este documento registra os contratos atuais observados entre frontend React e backend Python/FastAPI. Ele documenta o estado real do projeto hoje, incluindo endpoints duplicados, chamadas hardcoded e contratos frágeis. Não é uma proposta de arquitetura ideal.

Quando um comportamento não foi confirmado por leitura direta, ele está marcado como `não confirmado` ou `hipótese`.

## Comunicação frontend/backend

O frontend usa uma mistura de:

- `axios` com `getApiUrl(...)`, principalmente em `frontend/src/App.jsx`;
- `axios` com `apiUrl` passado por props em modais;
- `fetch('/api/...')` relativo;
- `fetch('http://localhost:8000/...')` hardcoded em alguns componentes;
- WebSocket em `/ws`;
- hook `useDownloadStatus.js` tentando usar `/ws/download/{jobId}`.

O backend expõe rotas diretamente em `backend/main.py` e também via routers em `backend/routers/`.

Risco atual: não há uma camada frontend única de API nem tipos compartilhados para payload/response.

## Endpoints de busca e resolução

### Search

```txt
Método: POST
Caminho: /search
Chamado por: frontend/src/App.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: { query: string, limit?: number }
Resposta esperada: { results: Array<{ id, title, uploader, duration_string, url, thumbnail, view_count }> }
Estados possíveis: não aplicável
Erros conhecidos: HTTP 500 com detail em falha yt-dlp/cookies/busca
Observações: suporta prefixos music: e ytm: para tentativa YouTube Music; fallback para yt-dlp.
```

### Info

```txt
Método: POST
Caminho: /info
Chamado por: frontend/src/App.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: { url: string }
Resposta esperada: metadados do vídeo/playlist, incluindo title, thumbnail, url, resolutions, subtitles e flags como is_playlist quando aplicável.
Estados possíveis: não aplicável
Erros conhecidos: HTTP 500/erro genérico quando resolver falha
Observações: há duas definições de @router.post("/info") em backend/routers/stream.py; contrato efetivo precisa de revisão humana.
```

### Playlist details

```txt
Método: POST
Caminho: /playlist/details
Chamado por: frontend/src/App.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: { url: string, limit?: number }
Resposta esperada: { videos: Array<...> } com vídeos, status e índices
Estados possíveis: status por vídeo, como downloaded/pending, conforme resposta
Erros conhecidos: timeout ou erro yt-dlp/parser
Observações: também aparece duplicado em backend/routers/stream.py.
```

## Endpoints de download

### Download/enqueue

```txt
Método: POST
Caminho: /download e /download/enqueue
Chamado por: App.jsx, fila/download consecutivo, componentes de download
Implementado em: backend/routers/downloads.py
Payload de entrada:
  {
    url,
    quality,
    format?,
    mode,
    playlist?,
    start_time?,
    end_time?,
    pitch?,
    speed?,
    title?,
    artist?,
    cover_path?,
    browser_cookies?,
    video_codec?,
    compress_video?,
    cookies_path?,
    eq_preset?,
    playlist_id?,
    video_id?,
    organize?,
    organize_by_playlist?
  }
Resposta esperada: { job_id: string }
Estados possíveis: queued, running, downloading, processing, retry_method_N, done, error, timeout, cancelled, rate_limited
Erros conhecidos: HTTP 500/erro backend; falha posterior vem pelo job/WebSocket
Observações: /download e /download/enqueue apontam para a mesma função.
```

### Download retry

```txt
Método: POST
Caminho: /download/retry
Chamado por: App.jsx
Implementado em: backend/routers/downloads.py
Payload de entrada: { playlist_id: string, video_id: string }
Resposta esperada: { status: "ok", job_id: string }
Estados possíveis: queued e estados normais do job
Erros conhecidos: 404 se registro não existir no histórico
Observações: usa banco para reconstruir URL quando possível.
```

### Download status

```txt
Método: GET
Caminho: /download/status/{job_id}
Chamado por: App.jsx
Implementado em: backend/routers/downloads.py
Payload de entrada: path param job_id
Resposta esperada: JobState serializado
Estados possíveis: status do JobState
Erros conhecidos: 404 se job não existir
Observações: usado por polling em alguns fluxos.
```

### Download jobs

```txt
Método: GET
Caminho: /download/jobs
Chamado por: App.jsx/possível UI de fila
Implementado em: backend/routers/downloads.py e também backend/main.py
Payload de entrada: nenhum
Resposta esperada: { [job_id]: JobState }
Estados possíveis: todos os estados de download
Erros conhecidos: não confirmado
Observações: endpoint duplicado entre router e main.py.
```

### Download cancel

```txt
Método: POST
Caminho: /download/cancel/{job_id}
Chamado por: App.jsx/fila
Implementado em: backend/routers/downloads.py
Payload de entrada: path param job_id
Resposta esperada: { job_id, status: "cancelled" }
Estados possíveis: cancelled, 404
Erros conhecidos: cancelamento depende de o downloader observar status no progress hook.
Observações: não mata necessariamente processo externo imediatamente em todos os pontos; comportamento exato em subprocess é hipótese.
```

## Endpoints de biblioteca

### Library

```txt
Método: GET
Caminho: /api/library
Chamado por: LibraryModal.jsx, ShazamModal.jsx, StudioModal.jsx
Implementado em: backend/routers/library.py e backend/main.py
Payload de entrada: nenhum
Resposta esperada: lista de músicas com title, file_path, video_id, thumbnail e metadados disponíveis
Estados possíveis: não aplicável
Erros conhecidos: arquivo ausente pode aparecer como missing conforme sync
Observações: endpoint duplicado entre router e main.py.
```

### History

```txt
Método: GET
Caminho: /api/history?limit=...
Chamado por: HistoryModal.jsx
Implementado em: backend/routers/library.py e backend/main.py
Payload de entrada: query limit opcional
Resposta esperada: lista de histórico
Estados possíveis: downloaded, missing, error conforme banco
Erros conhecidos: não confirmado
Observações: duplicado entre router e main.py.
```

```txt
Método: DELETE
Caminho: /api/history/{video_id}
Chamado por: HistoryModal.jsx
Implementado em: backend/routers/library.py e backend/main.py
Payload de entrada: path param video_id
Resposta esperada: status/sucesso
Estados possíveis: não confirmado
Erros conhecidos: não confirmado
Observações: duplicado.
```

### Favorites

```txt
Método: GET / POST / DELETE
Caminhos:
  /api/favorites
  /api/favorites/add
  /api/favorites/{video_id}
  /api/favorites/check/{video_id}
Chamado por: LibraryModal.jsx
Implementado em: backend/routers/library.py e backend/main.py
Payload de entrada: { video_id, title, file_path } para add
Resposta esperada: lista, status ou bool/check
Estados possíveis: não aplicável
Erros conhecidos: duplicação de implementação
Observações: contrato deve ser preservado antes de mexer em biblioteca.
```

## Endpoints de stream

```txt
Método: POST
Caminho: /api/stream/resolve
Chamado por: LibraryModal.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: { query: string }
Resposta esperada: { url, title, artist, thumbnail, duration, video_id }
Estados possíveis: não aplicável
Erros conhecidos: 404 se não resolver; 500 em erro yt-dlp
Observações: usado para tocar sem baixar.
```

```txt
Método: POST
Caminho: /api/stream/playlist
Chamado por: LibraryModal.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: { url: string }
Resposta esperada: lista/playlist de streams
Estados possíveis: não confirmado
Erros conhecidos: não confirmado
Observações: revisar payload real antes de alterar.
```

```txt
Método: POST
Caminho: /api/stream/artist
Chamado por: LibraryModal.jsx, PlayerBar.jsx indiretamente para artist_info separado
Implementado em: backend/routers/stream.py
Payload de entrada: { artist: string }
Resposta esperada: recomendações/faixas do artista
Estados possíveis: não aplicável
Erros conhecidos: não confirmado
Observações: usado para navegação/artista.
```

```txt
Método: GET
Caminho: /api/stream/proxy?video_id=... ou ?url=...
Chamado por: LibraryModal.jsx
Implementado em: backend/routers/stream.py
Payload de entrada: query video_id ou url
Resposta esperada: stream proxied
Estados possíveis: não aplicável
Erros conhecidos: URLs assinadas podem expirar
Observações: sensível a headers e URLs temporárias.
```

## Endpoints de configurações

Chamados principalmente por `SettingsModal.jsx`.

```txt
GET/POST /api/settings/concurrent_downloads
Entrada POST: { value }
Resposta: { value } ou { status: "ok", value }
Implementado em: backend/routers/settings.py
Observação: POST também troca semáforo de downloads em runtime.
```

```txt
GET/POST /api/settings/start_minimized
Entrada POST: { value: boolean }
Resposta: { value } ou { status: "ok", value }
Implementado em: backend/routers/settings.py
```

```txt
GET /api/settings/download_folder
POST /api/settings/choose_folder
Resposta: folder/status
Implementado em: backend/routers/settings.py
Observação: choose_folder abre diálogo local.
```

```txt
GET/POST /api/settings/lastfm
Entrada POST: { username, password? }
Resposta: username/status
Implementado em: backend/routers/settings.py
Observação: password é enviado pelo frontend; armazenamento real de senha não confirmado pela leitura do trecho.
```

```txt
GET/POST /api/settings/telegram
POST /api/settings/telegram/test
Entrada: { token, chat_id, enabled? }
Resposta: status/config
Implementado em: backend/routers/settings.py
Observação: token de bot é sensível.
```

Outros endpoints chamados por Settings:

- `GET /api/voice/status`, `POST /api/voice/toggle` em `main.py`.
- `GET /api/db/sync` em `main.py`.
- `POST /api/upload_wallpaper` em `main.py`.
- `POST /api/system/startup?enable=...` em `main.py`.
- `POST /upload_cookies` em `main.py`.
- `POST /shutdown` chamado no frontend, implementação não confirmada no mapeamento atual.
- `/api/settings/miniplayer_hotkey` chamado no frontend, implementação não confirmada no mapeamento atual.

## Endpoints de tags/metadados

```txt
GET /api/tags/read?file_path=...
POST /api/tags/save
POST /api/tags/fetch_lyrics
POST /api/choose_lrc_file
GET /api/track_metadata?file_path=...
GET /api/artist_info?artist=...
POST /api/fix_metadata
```

Chamados por:

- `TagEditorModal.jsx`;
- `PlayerBar.jsx`;
- `ShazamModal.jsx`;
- `LibraryModal.jsx`.

Payloads principais:

- tags save: `{ file_path, title?, artist?, album?, year?, lyrics?, cover_base64? }`;
- fetch lyrics: `{ file_path, title, artist? }`;
- fix metadata: `{ file_path }`.

Risco: endpoints recebem `file_path` e precisam de validação de path.

## Endpoints de studio/Demucs

```txt
POST /api/studio/split
GET /api/studio/jobs
GET /api/studio/status/{job_id}
POST /api/studio/install
POST /api/studio/install_full
GET /api/studio/install/status/{job_id}
```

Chamados por `StudioModal.jsx`.

Payload principal:

```txt
{ file_path, quality, model, two_stems }
```

Observações:

- `backend/routers/studio.py` possui duas definições de `POST /api/studio/install`.
- usa subprocess/Demucs/Python externo.
- recebe `file_path` relativo à pasta de downloads em parte do fluxo.

## Endpoints mobile

```txt
POST /api/mobile/token/create
GET /api/mobile/token/status?token=...
POST /api/mobile/token/approve?token=...
GET /api/network/ip
GET /api/mobile?token=...
GET /api/downloads/list?token=...
POST /api/downloads/zip/start?token=...
GET /api/downloads/zip/status/{job_id}?token=...
GET /api/downloads/zip/download/{job_id}?token=...
POST /api/mobile/download?token=...
```

Chamados por `MobileSyncModal.jsx` e UI mobile servida pelo backend.

Observações:

- tokens ficam em memória e expiram em 5 minutos.
- alguns fetches usam `http://localhost:8000` hardcoded.
- endpoints mobile também aparecem duplicados entre `main.py` e `backend/routers/mobile.py`.

## WebSocket `/ws`

```txt
Método: WebSocket
Caminho: /ws
Chamado por: App.jsx
Implementado em: backend/main.py
Payload recebido pela UI:
  - mapa de jobs `{ [job_id]: JobState }`
  - eventos especiais como PLAY_EXTERNAL/voice_command conforme App.jsx
Resposta esperada: atualizações frequentes de jobs
Estados possíveis: todos os estados do JobState
Erros conhecidos: mensagens fora de ordem ou reconexão podem deixar UI com estado antigo
Observações: backend transmite via broadcast loop.
```

Contrato suspeito:

```txt
Caminho: /ws/download/{jobId}
Chamado por: frontend/src/hooks/useDownloadStatus.js
Implementado em: não confirmado
Observações: não foi encontrado endpoint correspondente no mapeamento de backend/main.py e backend/routers.
```

## Estados de download

Estados encontrados no backend:

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

Estados encontrados/esperados na UI:

- `pending`
- `queued`
- `downloading`
- `running`
- `processing`
- `done`
- `completed`
- `error`
- `timeout`
- `cancelled`

Risco: backend usa `done`, algumas UIs também tratam `completed`. A fila visual também possui `pending`, que é estado frontend, não necessariamente backend.

## Payloads principais

### DownloadRequest

Definido em `backend/routers/downloads.py`. Campos observados:

```txt
url, quality, format, mode, playlist, start_time, end_time,
pitch, speed, title, artist, cover_path, browser_cookies,
video_codec, compress_video, cookies_path, eq_preset,
playlist_id, video_id, organize, organize_by_playlist
```

### JobState

Definido em `backend/downloader.py`:

```txt
id, status, progress, title, filename, error,
created_at, started_at, finished_at, last_update,
speed_str, total_bytes_str, downloaded_bytes_str
```

### StudioSplitRequest

```txt
file_path, quality, model, two_stems
```

### TagWriteRequest

```txt
file_path, title, artist, album, year, lyrics, cover_base64
```

### MobileDownloadRequest

```txt
url, title, thumbnail
```

## Contratos frágeis

- Rotas duplicadas entre `main.py` e routers.
- Duas definições de `/info` e `/playlist/details` em `stream.py`.
- Duas definições de `/api/studio/install` em `studio.py`.
- Frontend chama alguns endpoints por URL hardcoded `http://localhost:8000`.
- `fetch('/api/...')` relativo convive com `getApiUrl`.
- Estados de download têm nomes diferentes entre fila frontend e backend.
- Erros frequentemente retornam apenas `detail` ou strings genéricas.
- WebSocket envia mapa global de jobs, não apenas delta por job.

## Endpoints duplicados ou suspeitos

Duplicados confirmados por leitura:

- `GET /download/jobs`
- `GET /api/library`
- `GET /api/history`
- favoritos `/api/favorites*`
- subscriptions `/api/subscriptions*`
- mobile `/api/mobile*`
- downloads zip `/api/downloads/zip/*`
- `POST /info` em `stream.py`
- `POST /playlist/details` em `stream.py`
- `POST /api/studio/install` em `studio.py`
- `GET/POST /api/miniplayer/state` em `main.py` e `backend/miniplayer.py` (pré-existente em `main`; fora do escopo da fase de deduplicação atual).

Observação sobre miniplayer: o router `backend/miniplayer.py` é incluído em `main.py` antes das definições `@app.post/@app.get("/api/miniplayer/state")`. Como o FastAPI despacha na ordem de registro, a versão simples de `miniplayer.py` vence. Consequentemente, a versão de `main.py` (que integra Discord RPC) é código morto — o `discord_rpc.update_presence(...)` nunca é chamado por esse caminho. O frontend posta `{title, artist, cover_url, isPlaying, progress, duration}`, compatível com `MiniPlayerState` em `miniplayer.py`.

Suspeitos/não confirmados:

- `/ws/download/{jobId}` chamado por hook, não encontrado no backend.
- `/api/settings/miniplayer_hotkey` chamado por SettingsModal, implementação não confirmada.
- `/shutdown` chamado por SettingsModal, implementação não confirmada.
- `/api/trim_audio` chamado por AudioTrimmerModal, implementação não confirmada no mapeamento atual.
- `/api/studio_library` chamado por LibraryModal, implementação não confirmada no mapeamento atual.
- `/api/scrobble` chamado por PlayerBar, implementação não confirmada no mapeamento atual.

## Riscos ao alterar contratos

- Download pode concluir no backend e UI ficar presa em `processing`/`downloading`.
- Mudança de `done` para `completed` ou vice-versa quebra fila.
- Alterar shape de JobState quebra WebSocket e QueueDrawer.
- Alterar `/info` quebra tela de confirmação e download consecutivo.
- Alterar `file_path` pode quebrar player, tags, biblioteca, studio e open_external.
- Erro genérico impede UI de orientar usuário sobre cookies, 403/429 ou login.
- URLs assinadas podem vazar se resposta/log bruto for enviado ao frontend.

## Checklist antes de mudar API

1. Mapear quem chama o endpoint no frontend.
2. Verificar se há endpoint duplicado em `main.py` e router.
3. Documentar payload atual antes de alterar.
4. Preservar campos antigos ou criar compatibilidade.
5. Padronizar erro sem remover `detail`.
6. Testar dev e build Vite.
7. Testar executável se envolver paths/static/helpers.
8. Testar download normal, erro e cancelamento.
9. Testar biblioteca/player depois de download.
10. Atualizar esta documentação.
