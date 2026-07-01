# Build e Runtime

## Frontend dev

Comandos atuais em `frontend/package.json`:

```bash
cd frontend
npm install
npm run dev
```

`npm run dev` executa Vite.

## Backend dev

Dependências em `backend/requirements.txt`. Fluxo provável:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Hipótese: o app desktop/tray pode iniciar o backend por `backend_tray.py`, não apenas por `uvicorn main:app`.

## Build Vite

```bash
cd frontend
npm run build
```

`frontend/vite.config.js` define:

```txt
outDir: ../backend/static
emptyOutDir: true
base: ./
```

Isso significa que o build apaga/recria `backend/static`.

## `frontend/dist` e `backend/static`

O projeto não usa `frontend/dist` como saída final no estado atual. A saída oficial do build Vite é `backend/static`, consumida pelo backend e pelo executável.

## PyInstaller

`backend/build_exe.py` monta um executável `Lumina.exe` a partir de `backend_tray.py`.

O script adiciona:

- `ffmpeg.exe`;
- `ffprobe.exe`;
- `aria2c.exe`;
- `node.exe`;
- `static`;
- `TERMS.md`;
- `lyrics_fetcher.py`;
- `icon.ico`;
- Vosk;
- `bgutil_server`;
- diversos hidden imports.

Saída esperada pelo script:

```txt
backend/dist/Lumina.exe
```

## Build desktop oficial

Pelo estado atual do script e mensagens, PyInstaller é o build desktop considerado operacional. A presença de `frontend/src-tauri/` indica experimento ou alternativa Tauri, mas não parece ser o caminho oficial do build atual.

## Tauri

Existe `frontend/src-tauri/` com `Cargo.toml`, `tauri.conf.json`, ícones e build Rust. Também há script `npm run tauri`. Documentação atual não prova que ele substitui PyInstaller.

Hipótese: Tauri está em avaliação ou parcialmente integrado.

## Dependências externas

Runtime:

- FFmpeg/FFprobe;
- aria2c;
- yt-dlp;
- Node;
- Deno/BGUtil;
- Python/FastAPI;
- SQLite;
- cookies.txt;
- Vosk, Demucs/Torch/ShazamIO para funções extras.

Frontend:

- Node/npm;
- Vite;
- React;
- Tailwind;
- Framer Motion.

## O que precisa existir no executável final

- `backend/static` atualizado;
- AudioWorklets e IRs dentro de static;
- FFmpeg/FFprobe/aria2c;
- node/deno/helper conforme usado;
- `bgutil_server`;
- banco/config path gravável;
- pasta de downloads gravável;
- cookies, se usuário configurar;
- hidden imports PyInstaller necessários.

## Arquivos gerados que não devem ser versionados

- `backend/dist/`
- `backend/build/`
- `backend/downloads/`
- `backend/*.exe_extracted/`
- `backend/deno/`
- `backend/test_out/`
- `backend/split_output/`
- `backend/output.json`
- `backend/bgutil_server/tsconfig.tsbuildinfo`
- `frontend/node_modules/`
- `**/.vite/`
- `coverage/`
- `*.tmp`, `*.temp`, `*.tsbuildinfo`
- `**/cookies.txt`, `**/cookies-*.txt`

## Como validar build

Validação mínima:

```bash
cd frontend
npm run build
npm run lint
```

Observação atual: o lint pode falhar por backlog conhecido em worklets/Fast Refresh/hooks. Build passar não garante download nem player.

Validação manual recomendada:

- abrir app dev;
- buscar uma música;
- baixar áudio MP3;
- baixar vídeo;
- testar cookies;
- tocar arquivo baixado;
- abrir diagnóstico de áudio;
- rodar Auto-Calib e Seek/Tail Reset;
- gerar executável e testar fora do ambiente dev.
