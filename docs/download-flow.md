# Fluxo de Download

## Fluxo geral

```txt
URL/busca
→ resolução de info
→ estratégia/fallback
→ yt-dlp / SABR / cookies / PO Token
→ download temporário
→ FFmpeg / conversão / remux
→ tags / capa / metadados / letras
→ salvamento em downloads
→ registro no SQLite
→ biblioteca
→ reprodução no PlayerBar
```

## Entrada: URL ou busca

No frontend, `App.jsx` decide se o texto é URL ou busca. Busca chama `/search`; URL chama `/info`. Playlists podem chamar `/playlist/details`.

O router principal de stream também trata links “mágicos” via `magic_parsers.py` para Spotify/Apple/SoundCloud e similares.

## Resolução de informação

`backend/routers/stream.py` expõe `/info` e `/playlist/details`. O arquivo contém duplicações de classes/rotas para info e playlist, então a ordem efetiva de registro deve ser validada antes de refatorar.

`/info` retorna metadados como título, thumbnail, resoluções, subtitles e flags de playlist, dependendo do resolver.

## Criação do job

`POST /download` e `POST /download/enqueue` em `backend/routers/downloads.py` criam:

- `job_id` UUID;
- `JobState` em memória;
- entrada persistida em `jobs_queue`;
- item em `download_queue`.

O frontend acompanha `currentJobId`, `globalJobs` e WebSocket `/ws`.

## Estratégias/fallbacks

`backend/downloader.py` define uma lista de estratégias em `download_with_retries`, incluindo:

- `sabr_live`;
- `tv_embedded`;
- `tv_unplugged`;
- `web_embedded`;
- `web_safari`;
- `web_creator`;
- `android_creator`;
- `ios_creator`;
- `android_vr`;
- `ios_music`;
- `android_music`;
- `standard_web`;
- `tv_client`;
- `android_client`;
- `ios_client`;
- `mweb`;
- `force_ipv4`;
- `force_ipv6`;
- `fallback_1080p`;
- `fallback_quality`;
- `ytmusic_fallback`, quando aplicável;
- `invidious_fallback`;
- `proxy_survival`.

Cada fallback ajusta client, cookies, impersonation, source address, formato ou proxy.

## Cookies

Cookies entram por:

- `get_cookies_path()`;
- `request.cookies_path`;
- upload via `/upload_cookies`;
- uso em busca, info e download quando disponível.

Risco: cookies são sensíveis e não devem ser logados nem versionados.

## SABR / BGUtil / PO Token

O fallback `sabr_live` usa `extractor_args_override` com `youtubepot-bgutilhttp` apontando para `http://127.0.0.1:4416`. O helper fica em `backend/bgutil_server/`. Há também `backend/po_token/generate.js`.

Hipótese: o backend inicia ou espera o helper BGUtil/PO Token em startup por `deno_manager.py`/código relacionado. Validar em `main.py` antes de mexer.

## yt-dlp

`build_ydl_opts` monta:

- formato por modo/qualidade;
- postprocessors;
- cookiefile;
- ffmpeg location;
- thumbnail/capa;
- subtitles;
- SponsorBlock;
- aria2c como downloader externo quando existe;
- sleeps anti-ban;
- progress hook.

## FFmpeg

FFmpeg entra por postprocessors yt-dlp e por subprocess no trim local.

Usos observados:

- extração MP3/M4A/FLAC;
- merge/remux de vídeo;
- metadata;
- thumbnail convert/embed;
- embed subtitles;
- filtros de áudio: pitch, speed, EQ, spatial, loudnorm;
- trim local com `ffmpeg -c copy`.

## Salvamento

Os arquivos vão para `get_downloads_dir()`. O template depende de organização por playlist/artista:

- direto em downloads;
- por playlist;
- por artista/álbum;
- combinação playlist/artista.

O caminho salvo no banco costuma ser relativo à pasta de downloads.

## Metadados, tags, capa e letras

Após download de áudio:

- `metadata_fetcher.apply_metadata` busca/aplica capa e tags;
- `lyrics_fetcher.fetch_and_embed_lyrics` tenta injetar letra;
- `database.mark_downloaded_db` registra título/path/status.

## Biblioteca

`database.py` registra downloads na tabela `downloads`. `sync_db_with_disk` verifica arquivos ausentes e importa arquivos locais órfãos.

O frontend lista biblioteca via `/api/library`.

## Progresso para UI

O progress hook do yt-dlp atualiza `jobs[job_id]` com:

- status;
- progress;
- title;
- speed;
- total;
- downloaded.

`main.py` transmite jobs via WebSocket `/ws`. O frontend também pode consultar endpoints de status/jobs.

## Estados possíveis

Estados observados no código:

- `queued`
- `running`
- `downloading`
- `processing`
- `retry_method_N`
- `done`
- `completed` em algumas UIs/filas
- `error`
- `timeout`
- `cancelled`
- `rate_limited`

Há risco de inconsistência porque UI e backend usam nomes parecidos, mas nem sempre idênticos.

## Riscos conhecidos

- fallback morto ou caro demais rodando antes do simples;
- rotas duplicadas de `/info` e `/playlist/details`;
- token BGUtil/PO expirado;
- cookies inválidos ou em formato errado;
- cancelamento depende de status e exceção no progress hook;
- arquivos temporários `.trimmed.tmp`;
- downloads simultâneos e nomes iguais;
- paths com acentos/espaços;
- URLs assinadas em logs;
- diferença entre dev e executável final.
