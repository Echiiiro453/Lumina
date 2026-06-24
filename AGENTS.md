---
trigger: always_on
---

# GUIA DE AGENTES E DESENVOLVEDORES DO LUMINA

Este arquivo é a fonte de verdade para agentes de IA e contribuidores que trabalham neste repositório.
Ele substitui qualquer instrução antiga de outros projetos. O produto deste workspace é o **Lumina**.

Para contexto de usuário e produto, consulte:
- `README.md`
- `DEVELOPMENT.md`
- `TECHNICAL_SPECS.md`
- `ROADMAP.md`
- `CHANGELOG.md`

---

## VISÃO GERAL

O Lumina é um aplicativo local/desktop para baixar, organizar, reproduzir e processar músicas e vídeos de YouTube, Spotify, Apple Music e outras fontes suportadas pelo backend.

Stack principal:
- **Frontend:** React 19, Vite, TailwindCSS, Framer Motion, lucide-react, Material You e Web Audio API.
- **Backend:** Python, FastAPI, Uvicorn, SQLite, yt-dlp, ffmpeg, aria2c, curl_cffi, Demucs, Shazam, Vosk e PyWebView.
- **Empacotamento:** PyInstaller gera o `Lumina.exe` portátil a partir de `backend/build_exe.py` e `backend/backend_tray.py`.
- **Servidor local:** o backend roda na porta `8000`; em desenvolvimento o Vite roda na porta `5173`.
- **Assets estáticos:** `npm run build` em `frontend/` escreve diretamente em `backend/static` via `frontend/vite.config.js`.

Importante:
- `frontend/src-tauri/` ainda existe e possui configuração Tauri, mas a distribuição documentada atual usa PyWebView + PyInstaller. Trate Tauri como secundário/legado, a menos que a tarefa mencione Tauri explicitamente.
- Há nomes antigos como `AppMusica` em algumas pastas, regras de firewall e diretórios de dados. Não faça renomeação ampla sem pedido explícito.
- O projeto contém arquivos grandes, binários e artefatos gerados. Edite apenas o necessário.

Princípios do projeto:
- **Local-first:** recursos de IA/áudio como Demucs e Vosk devem continuar locais quando já forem locais.
- **Privacidade:** cookies, histórico local, banco SQLite e downloads do usuário não devem vazar em logs ou commits.
- **Robustez contra mudanças externas:** o YouTube muda com frequência; mantenha `yt-dlp`, clientes de fallback, cookies e bgutil tratados com cuidado.
- **Interface rica, mas utilitária:** o app é uma ferramenta de uso repetido; preserve ergonomia, densidade visual e feedback claro.
- **Encoding:** use UTF-8. Antes de editar arquivos com acentos, leia e grave como UTF-8 para evitar mojibake.

---

## ARQUITETURA

Fluxo de desenvolvimento:
1. `backend/main.py` cria o app FastAPI, registra routers, WebSocket, arquivos estáticos, downloads e tarefas de startup.
2. `backend/backend_tray.py` inicia o servidor Uvicorn, abre a janela PyWebView, cria tray icon e suporta `--server-only`.
3. `frontend/src/App.jsx` concentra a experiência principal: busca, fila, downloads, player, modais, WebSocket e integrações.
4. `frontend/src/components/` guarda componentes de UI como `PlayerBar`, `QueueDrawer`, `SettingsModal`, `LibraryModal`, `StudioModal` e `MobileSyncModal`.
5. `frontend/public/*-processor.js` contém AudioWorklets usados pelo motor DSP/mastering.
6. `backend/downloader.py` executa downloads, fila, estratégias yt-dlp, ffmpeg, aria2c, metadados, letras e fallback de clientes.
7. `backend/database.py` gerencia SQLite para downloads, favoritos, settings e fila pendente.
8. `backend/utils.py` centraliza caminhos de recursos, dados, downloads e cookies.
9. `backend/bgutil_server/` contém o servidor Node/TypeScript usado para PO Token/bgutil em runtime.
10. `backend/routers/` deve receber novas rotas sempre que possível, em vez de aumentar ainda mais `main.py`.

Camadas e Clean Code/MVC:
- **View:** React em `frontend/src`, componentes em `frontend/src/components` e estilos/assets do frontend. A View não deve conhecer detalhes de yt-dlp, SQLite, ffmpeg ou caminhos internos do backend.
- **Controller:** rotas FastAPI em `backend/routers` e rotas legadas ainda presentes em `backend/main.py`. Controllers devem validar entrada, chamar serviços/funções de domínio e devolver respostas HTTP.
- **Model/Persistência:** `backend/database.py` e modelos Pydantic próximos das rotas. Acesso direto ao SQLite deve ficar centralizado no módulo de banco ou em módulos de repositório futuros.
- **Service/Domínio:** download, streaming, metadados, letras, Studio, Shazam, subscriptions, mobile sync e demais regras de negócio devem viver em módulos dedicados, não misturadas com UI ou handlers HTTP extensos.
- Ao tocar código legado grande, prefira extrair uma responsabilidade por vez e manter compatibilidade de rotas, payloads, paths, banco e arquivos do usuário.
- Remova legado somente quando houver evidência de que é duplicado, inalcançável, não importado ou substituído por uma implementação equivalente. Quando houver risco de quebrar upgrade, preserve e documente.
- Evite duplicar helpers entre routers. Funções compartilhadas devem ir para `backend/utils.py` ou módulo específico de serviço.
- `main.py` e `App.jsx` são pontos de integração grandes; novas features devem nascer em routers/componentes/serviços separados sempre que possível.

Diretórios principais:

```text
Lumina/
|-- backend/
|   |-- main.py              # FastAPI, WebSocket, startup e rotas legadas
|   |-- backend_tray.py      # Entrada desktop PyWebView/tray
|   |-- downloader.py        # Motor yt-dlp/ffmpeg/aria2c e fila
|   |-- database.py          # SQLite e persistência local
|   |-- utils.py             # Caminhos portáteis e recursos empacotados
|   |-- routers/             # Rotas modulares
|   |-- static/              # Build Vite servido pelo backend
|   |-- bgutil_server/       # Servidor Node auxiliar
|   `-- models/              # Modelos locais, como Vosk
|-- frontend/
|   |-- src/
|   |   |-- App.jsx          # App React principal
|   |   |-- components/      # Componentes React
|   |   |-- utils/           # Tema e utilitários do frontend
|   |   `-- i18n.js          # Traduções PT/EN/ES
|   |-- public/              # AudioWorklets e testes de áudio
|   |-- src-tauri/           # Tauri secundário/legado
|   `-- vite.config.js       # Build sai em ../backend/static
|-- docs/                    # Site/documentação estática
|-- README.md
|-- DEVELOPMENT.md
|-- TECHNICAL_SPECS.md
`-- AGENTS.md
```

---

## BACKEND

Responsabilidades principais:
- Expor APIs HTTP e WebSocket na porta `8000`.
- Servir o frontend compilado em `backend/static`.
- Gerenciar downloads assíncronos via `download_queue`, `jobs` e workers.
- Persistir downloads, favoritos, settings e fila em SQLite.
- Ler cookies do usuário por `get_cookies_path()` para conteúdos restritos.
- Controlar integrações locais: Demucs, Shazam, Vosk, miniplayer, mobile sync, tag editor e subscriptions.
- Inicializar o servidor `bgutil_server` no startup para suporte ao PO Token.

Regras de manutenção:
- Prefira adicionar novas APIs em `backend/routers/*.py`.
- Use `get_resource_path`, `get_data_dir`, `get_downloads_dir` e `get_cookies_path`; não hardcode caminhos absolutos de usuário.
- Preserve a porta `8000` salvo pedido explícito, pois frontend, mobile sync e PyWebView dependem dela.
- Preserve o contrato do WebSocket `/ws`: o frontend espera snapshots de `jobs` e eventos como `PLAY_EXTERNAL` e `voice_command`.
- Ao alterar downloads, mantenha cancelamento, timeout, semáforos e remoção da fila funcionando.
- Ao alterar `downloader.py`, cuide para não quebrar estratégias de fallback, cookies, aria2c, ffmpeg, metadata, letras e status do job.
- Ao alterar Demucs ou Spotify, respeite os interceptores CLI `--run-demucs` e `--run-spotify`; eles existem para isolar processos pesados.
- Ao alterar startup/shutdown, encerre corretamente processos auxiliares como `bgutil_process`.
- Evite `except:` amplo em código novo. Se o padrão legado exigir tolerância, capture exceções de forma localizada e logue uma mensagem útil.

Dados locais e paths:
- Banco: `downloads.db` dentro de `get_data_dir()`.
- Downloads: `get_downloads_dir()`, podendo vir de setting do usuário.
- Cookies: `cookies.txt` em `get_data_dir()` ou bundle empacotado.
- Studio/Lab: subpastas criadas a partir da pasta de downloads.

---

## FRONTEND

Responsabilidades principais:
- UI principal de busca, confirmação, downloads, fila e player.
- Modais de configuração, biblioteca, histórico, playlist, Spotify, Shazam, Studio, mobile sync, subscriptions e tag editor.
- Comunicação com o backend por Axios e WebSocket.
- Tema dinâmico Material You em `frontend/src/utils/theme.js`.
- Player e processamento de áudio via Web Audio API e AudioWorklets.

Regras de manutenção:
- Para novas strings visíveis, atualize `frontend/src/i18n.js` mantendo paridade entre Português, Inglês e Espanhol.
- Prefira componentes em `frontend/src/components/` em vez de aumentar `App.jsx`, quando a mudança tiver superfície própria.
- Preserve `getApiUrl()` apontando para a porta `8000`, salvo tarefa específica de configuração.
- Use `lucide-react` para ícones quando houver ícone equivalente.
- Preserve layouts responsivos e densos. Este app é ferramenta, não landing page.
- Ao mexer em modais, garanta fechamento, estado vazio, loading e erro.
- Ao mexer em fila/downloads, confira `QueueDrawer`, `QueueItem`, `globalJobs`, `currentJobId` e sincronização por WebSocket.
- Ao mexer em player/áudio, confira `PlayerBar`, `EqualizerModal`, `AudioDiagnosticsPanel` e os worklets em `frontend/public`.
- Evite criar scripts Python dentro de `frontend/src`; o `.gitignore` já trata isso como temporário/indevido.

AudioWorklets:
- Arquivos `frontend/public/*-processor.js` rodam em contexto separado do React.
- Não importe React, Axios ou dependências de UI dentro de worklets.
- Mantenha mensagens `postMessage` pequenas e estáveis.
- Se alterar DSP, use as páginas `frontend/public/audio-tests*.html` quando fizer sentido.

---

## BUILD E EXECUÇÃO

Instalação frontend:

```bash
cd frontend
npm install
```

Rodar frontend em desenvolvimento:

```bash
cd frontend
npm run dev
```

Rodar backend em desenvolvimento:

```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Rodar desktop local via PyWebView:

```bash
cd backend
python backend_tray.py
```

Rodar apenas servidor local:

```bash
cd backend
python backend_tray.py --server-only
```

Build do frontend para o app empacotado:

```bash
cd frontend
npm run build
```

Esse comando escreve em `backend/static` por configuração do Vite.

Build do executável Windows:

```bash
cd backend
python build_exe.py
```

O build espera binários e recursos como `ffmpeg.exe`, `ffprobe.exe`, `aria2c.exe`, `node.exe`, `icon.ico`, `bgutil_server` e `backend/static`.

---

## VERIFICAÇÃO

Escolha verificações proporcionais à mudança.

Frontend:

```bash
cd frontend
npm run lint
npm run build
```

Backend:

```bash
cd backend
python -m py_compile main.py downloader.py database.py utils.py
```

Para checar routers:

```powershell
Get-ChildItem backend\routers -Filter *.py | ForEach-Object { python -m py_compile $_.FullName }
```

Execução manual recomendada para mudanças integradas:
- Subir backend na porta `8000`.
- Subir Vite na porta `5173`.
- Abrir a UI, validar busca, fila, WebSocket e ação alterada.
- Para mudanças de build, rodar `npm run build` e iniciar `python backend_tray.py --server-only`.

Não assuma que existe suite automatizada completa. Se não conseguir rodar uma verificação, registre isso no fechamento da tarefa.

---

## SEGURANÇA E PRIVACIDADE

Nunca commitar:
- `cookies.txt`
- `backend/cookies.txt`
- Bancos `*.db`, `*.db-wal`, `*.db-shm`, `*.db-journal`
- `downloads/` e mídias baixadas
- `backend/downloads/`
- `backend/dist/`, `backend/build/`, `dist/`, `build/`
- `node_modules/`
- `backend/venv/`
- Binários grandes como `*.exe`, `*.zip`, `ffmpeg.exe`, `ffprobe.exe`, `aria2c.exe`, `node.exe`
- Logs, crash dumps e artefatos temporários

Regras:
- Nunca imprimir conteúdo de cookies em logs.
- Nunca expor caminhos pessoais desnecessários em mensagens de erro da UI.
- Tokens de mobile sync devem continuar temporários e validados.
- Downloads e biblioteca são dados do usuário; trate exclusões e renomeações com cuidado.
- Recursos que abrem arquivos externos devem validar caminho e existência antes de servir ou reproduzir.

---

## ESTILO DE CÓDIGO

Geral:
- Mantenha mudanças pequenas e focadas.
- Prefira nomes claros a comentários explicativos.
- Comentários devem explicar blocos não óbvios, não repetir o código.
- Evite números mágicos em código novo; use constantes locais ou settings.
- Preserve convenções existentes quando o arquivo já tiver um estilo claro.
- Não faça refatoração ampla junto de correção pequena.

Python:
- Use funções pequenas quando possível.
- Preserve compatibilidade com PyInstaller e runtime congelado (`sys.frozen`, `_MEIPASS`).
- Use `asyncio.to_thread` ou processos isolados para trabalho bloqueante/pesado.
- Evite bloquear o event loop FastAPI com processamento pesado.
- Ao mexer em subprocessos no Windows, use flags sem janela quando a experiência desktop exigir.

React/JavaScript:
- Use componentes funcionais e hooks.
- Preserve estados persistidos em `localStorage` quando já existirem.
- Evite quebrar dependências de `useEffect`; se precisar suprimir lint, justifique pelo padrão local.
- Prefira classes Tailwind e tokens existentes de tema em vez de cores soltas.
- Use `AnimatePresence`/`motion` de forma consistente com os modais existentes.

---

## COMMITS

Formato recomendado:

```text
Lumina: <Ação> <descrição concisa>
```

Ações permitidas:
- `Adicionar`
- `Corrigir`
- `Refatorar`
- `Remover`
- `Atualizar`
- `Testar`

Regras:
- Primeira palavra após `Lumina:` deve ser uma ação da lista.
- Descrição em português, curta e descritiva.
- Sem ponto final.
- Máximo de 72 caracteres no total.

Exemplos:

```text
Lumina: Corrigir fila de downloads
Lumina: Atualizar modal de configurações
Lumina: Refatorar rotas da biblioteca
```

---

## CUIDADOS ESPECÍFICOS

- Não trate `backend/static` como fonte primária do frontend; ele é saída do build Vite, embora esteja versionado neste workspace.
- Não apague `frontend/src-tauri` por parecer legado. Ele pode ser útil em tarefas específicas.
- Não remova worklets de `frontend/public`; o player e testes de áudio podem depender deles por nome.
- Não altere estratégia anti-bloqueio do `downloader.py` sem testar downloads reais ou registrar claramente a falta de teste.
- Não atualize dependências pesadas como `torch`, `demucs`, `yt-dlp`, Tauri ou React sem motivo claro.
- Ao mexer em nomes antigos `AppMusica`, verifique impactos em dados existentes, firewall, pastas do usuário e compatibilidade de upgrade.
- Antes de editar arquivos com acentos, leia/escreva como UTF-8 para evitar mojibake.
