# API Routes — Mapa Antes da Deduplicação

> Snapshot das rotas da aplicação **antes** das PRs 6.2/6.3 (deduplicação). Gerado por
> leitura direta dos decorators `@app.*` (main.py) e `@router.*` (routers/*.py).
>
> **Objetivo:** servir de referência para garantir que nenhuma rota pública desapareça
> durante a deduplicação. Após cada PR de rotas, regenerar e comparar com este mapa.

**Branch:** `chore/project-hygiene-docs-lint-runtime`
**Commit de referência:** `db6974e` (após Fase 5 — Segurança)

## Regra de "qual rota vence"

FastAPI registra rotas na ordem em que aparecem. Para o mesmo `método + path`, **a última
definição registrada é a que atende**. Os routers são incluídos em `main.py:67-79` (via
`app.include_router`) **antes** dos decorators `@app.*` serem avaliados no corpo de main.py.
Logo, para paths que existem em ambos, **a definição de main.py normalmente vence**.

⚠️ Exceção: a inclusão dos routers roda em ordem de import, mas os `@app.*` em main.py rodam
apenas quando o módulo é carregado até aquele ponto. Por isso o mapa abaixo marca o "vencedor
provável" — confirmar com `len(app.routes)` e teste manual antes/depois de cada PR.

---

## 1. Rotas ÚNICAS (sem duplicação) — NÃO TOCAR

### `main.py` — exclusivas
| Método | Path | Linha | Função |
|---|---|---|---|
| GET | `/api/logs` | 168 | buffer de logs |
| GET | `/api/db/sync` | 172 | sync disco (force=True) |
| GET | `/version` | 179 | APP_VERSION |
| POST | `/api/telemetry` | 188 | relay de log do frontend |
| GET | `/check_update` | 206 | GitHub releases |
| WS | `/ws` | 243 | broadcast de jobs |
| POST | `/api/miniplayer/open` | 478 | abre miniplayer |
| GET/POST | `/api/tags/read`,`/api/tags/save`,`/api/tags/fetch_lyrics` | 515,524,548 | tags/lyrics |
| GET/POST | `/presets` | 587,619 | presets DSP |
| POST | `/api/radio/next` | 693 | rádio |
| GET | `/auth_status` | 726 | status cookies |
| POST | `/upload_cookies` | 743 | upload cookies |
| GET/POST | `/terms/*` | 776,787,796 | termos |
| POST | `/api/spectral-analysis` | 1052 | espectro |
| GET/POST | `/api/miniplayer/state` | 1153,1172 | estado miniplayer |
| POST | `/api/open_external` | 1177 | abrir arquivo |
| POST | `/api/play_external` | 1197 | tocar arquivo |
| POST | `/api/set_default_player` | 1222 | registrar player |
| POST | `/api/fix_metadata` | 1303 | shazam fix |
| POST | `/api/choose_lrc_file` | 1385 | picker .lrc |
| POST | `/api/upload_wallpaper` | 1504 | wallpaper |
| GET | `/api/artist_info` | 1521 | info artista |
| POST | `/api/system/startup` | 1539 | startup do SO |
| GET | `/api/track_metadata` | 1602 | metadados faixa |
| GET/POST | `/api/voice/*` | 2149,2153 | voz |

### `routers/stream.py` — exclusivas
- `/search` (35), `/api/stream/resolve` (205), `/api/stream/playlist` (264),
  `/api/stream/artist` (325), `/api/stream/proxy` (450)

### `routers/downloads.py` — exclusivas
- `/download/retry` (42), `/download/enqueue` (56), `/download` (57),
  `/download/cancel/{job_id}` (66), `/download/status/{job_id}` (74)

### `routers/settings.py` — exclusivas (não duplicadas em main.py)
- `/api/settings/concurrent_downloads` (GET 9, POST 21)
- `/api/settings/start_minimized` (GET 38, POST 50)
- `/api/settings/download_folder` (GET 64)
- `/api/settings/choose_folder` (POST 69)
- `/api/settings/lastfm` (GET 106, POST 118)
- `/api/settings/telegram` (GET 128, POST 148), `/api/settings/telegram/test` (POST 165)

### `routers/studio.py` — exclusivas
- `/api/studio/split` (155), `/api/studio/jobs` (173), `/api/studio/status/{job_id}` (177),
  `/api/studio/install_full` (292), `/api/studio/install/status/{job_id}` (338)

### `routers/mobile.py` — exclusiva
- `/api/mobile/download` (181)

---

## 2. Rotas DUPLICADAS INTERNAMENTE (mesmo arquivo)

⚠️ A 2ª definição sempre sobrescreve a 1ª silenciosamente.

### `routers/stream.py`
| Path | 1ª def | 2ª def | Vencedora | Obs. |
|---|---|---|---|---|
| `POST /info` | 554 | 740 | **740** | 2ª usa web_sabr + bgutil base-url 127.0.0.1:4416 |
| `POST /playlist/details` | 658 | 849 | **849** | |

### `routers/studio.py`
| Path | 1ª def | 2ª def | Vencedora |
|---|---|---|---|
| `POST /api/studio/install` | 218 | 331 | **331** |

### `main.py`
| Path | 1ª def | 2ª def | Vencedora |
|---|---|---|---|
| `POST /api/choose_file` | 811 (webview) | 1356 (tkinter) | **1356** |
| `POST /api/convert` | 832 (async) | 1417 (sync) | **1417** |
| `ConvertRequest` (classe) | 825 | 1409 | **1409** |

---

## 3. Rotas DUPLICADAS main.py ↔ routers (cross-file)

Para o mesmo path, vence a definição registrada por último (normalmente a de main.py).

### Biblioteca/Favoritos/Histórico/Inscrições — `main.py` vs `routers/library.py` (11 pares)
| Path | main.py | library.py | Vencedora provável |
|---|---|---|---|
| `GET /api/favorites` | 437 | 16 | main.py |
| `POST /api/favorites/add` | 441 | 20 | main.py |
| `DELETE /api/favorites/{video_id}` | 446 | 25 | main.py |
| `GET /api/favorites/check/{video_id}` | 451 | 30 | main.py |
| `GET /api/history` | 1259 | 34 | main.py |
| `GET /api/library` | 1237 | 62 | main.py |
| `DELETE /api/history/{video_id}` | 1288 | 85 | main.py |
| `GET /api/subscriptions` | 390 | 101 | main.py |
| `POST /api/subscriptions/add` | 394 | 105 | main.py |
| `POST /api/subscriptions/remove` | 402 | 113 | main.py |
| `GET /api/subscriptions/{playlist_id:path}/downloads` | 410 | 121 | main.py |

⚠️ Note: `library.py:34` e `:62` chamam `sync_db_with_disk` em cada GET; `main.py` não. Após
Fase 4 PR 4.4, a sync tem TTL, então o impacto é menor — mas a divergência de comportamento
entre as duas versões ainda existe.

### Downloads — `main.py` vs `routers/downloads.py` (2 pares)
| Path | main.py | downloads.py | Vencedora provável |
|---|---|---|---|
| `GET /download/jobs` | 377 | 80 | main.py |
| `POST /open_folder` | 682 | 84 | main.py |

### Mobile — `main.py` vs `routers/mobile.py` (9 pares) ⚠️ STORES SEPARADOS
| Path | main.py | mobile.py | Vencedora provável |
|---|---|---|---|
| `POST /api/mobile/token/create` | 1698 | 20 | main.py |
| `GET /api/mobile/token/status` | 1705 | 27 | main.py |
| `POST /api/mobile/token/approve` | 1716 | 38 | main.py |
| `GET /api/network/ip` | 1744 | 66 | main.py |
| `GET /api/downloads/list` | 1748 | 70 | main.py |
| `POST /api/downloads/zip/start` | 1805 | 120 | main.py |
| `GET /api/downloads/zip/status/{job_id}` | 1824 | 139 | main.py |
| `GET /api/downloads/zip/download/{job_id}` | 1832 | 147 | main.py |
| `GET /api/mobile` (HTML) | 1860 | 196 | main.py |

🔴 **Crítico:** main.py e mobile.py cada um define o seu próprio `mobile_tokens` e `zip_jobs`
em memória. Um token criado pela rota do router é **invisível** aos handlers de main.py e
vice-versa. Quando a rota de main.py "vence", o store do router fica órfão. Unificar em PR 6.3.

---

## 4. Contagem total (antes)

- **main.py**: ~57 decorators `@app.*` (incluindo 2 duplicatas internas)
- **routers/library.py**: 12 rotas (11 duplicadas com main.py + 0 exclusivas)
- **routers/downloads.py**: 7 rotas (2 duplicadas + 5 exclusivas)
- **routers/mobile.py**: 10 rotas (9 duplicadas + 1 exclusiva)
- **routers/stream.py**: 7 rotas (2 pares duplicados internamente + 5 exclusivas)
- **routers/studio.py**: 7 rotas (1 duplicada internamente + 6 exclusivas)
- **routers/settings.py**: 11 rotas (0 duplicadas)

**Total de rotas duplicadas a resolver:** ~26 paths (11 library + 2 downloads + 9 mobile +
2 stream-interno + 1 studio-interno + 2 main-interno).

---

## 5. Plano de deduplicação (referência para PRs 6.2/6.3)

1. **PR 6.2 — interna por arquivo** (baixo risco):
   - stream.py: remover `/info` e `/playlist/details` da 1ª def (manter a 2ª, vencedora).
   - studio.py: remover `/api/studio/install` da 1ª def (manter a 2ª).
   - main.py: remover `/api/choose_file` e `/api/convert` da 1ª def + `ConvertRequest` 1ª.
2. **PR 6.3 — cross-file por domínio** (um PR por domínio):
   - 6.3a downloads (remover `/download/jobs`, `/open_folder` de main.py — manter router).
   - 6.3b library (remover 11 de main.py — manter router; garantir sync TTL já aplicado).
   - 6.3c mobile (remover 9 de main.py — manter router; **unificar stores mobile_tokens/zip_jobs**).

   ⚠️ Para mobile, é essencial mover o store unificado para o router (ou um módulo compartilhado),
   senão tokens criados por um lado somem ao outro.

---

## 6. Critério de "rota não desapareceu"

Após cada PR de rotas, rodar:

```python
# quick check
from main import app
routes = sorted({(tuple(r.methods - {"HEAD"}) if hasattr(r,'methods') and r.methods else ("WS",))[0], r.path} for r in app.routes if hasattr(r, "path"))
for r in routes: print(r)
```

Comparar a lista resultante com a contagem esperada. **Nenhum path deve sumir** — só a
quantidade de handlers por path deve reduzir para 1.
