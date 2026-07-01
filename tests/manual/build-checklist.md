# Build Checklist — Frontend static assets

> Checklist operacional para evitar os bugs mais comuns de build do Lumina:
> editar `backend/static` manualmente ou commitar assets desatualizados.

## O que é `backend/static`

`backend/static` **não é código-fonte** — é a saída do `vite build`. O `frontend/vite.config.js`
define `outDir: '../backend/static'` com `emptyOutDir: true`, então **cada `npm run build`
apaga e recria** essa pasta a partir de:

- `frontend/src/**` (código React)
- `frontend/public/**` (AudioWorklets `*-processor.js`, IRs em `irs/`, `lumina-mastering.js`,
  HTMLs de teste de áudio, favicon, `vite.svg`)

O backend serve essa pasta via `StaticFiles(directory=get_resource_path("static"), html=True)`
(`backend/main.py`), e o executável PyInstaller a embute (`backend/build_exe.py`).

⚠️ **Consequência**: qualquer edição feita diretamente em `backend/static/*-processor.js` ou
`backend/static/index.html` funciona no executável local **até o próximo `npm run build`**,
que a sobrescreve. Editar `backend/static` é sempre temporário e frágil.

## Regra de ouro

> **Nunca editar `backend/static` manualmente.**
> Toda mudança em assets públicos (worklets, IRs, etc.) deve ser feita em `frontend/public/**`,
> e toda mudança de UI em `frontend/src/**`. Depois, rodar `npm run build`.

## Workflow de PR frontend

Sempre que uma PR alterar `frontend/src/**` ou `frontend/public/**`:

```bash
cd frontend
npm.cmd run lint        # deve passar com 0 errors (warnings de exhaustive-deps são known)
npm.cmd run build       # gera backend/static (apaga e recria)
```

### Commitar assets separadamente do código

Os hashes dos bundles mudam a cada build (`assets/index-XXXXXXXX.js` / `.css`).
Commitar **sempre em 2 commits**:

```bash
# 1. Commit do código-fonte
git add frontend/src/<arquivo> frontend/public/<arquivo>
git commit -m "fix: <descrição>"

# 2. Commit dos assets construídos (NUNCA misturar com código)
git add backend/static/index.html backend/static/assets/
git commit -m "chore: update built frontend assets"
```

⚠️ **Nunca** `git add -A` ou `git add .` — a worktree costuma ter arquivos locais não
rastreados (cookies, downloads, scripts de instrumentação, bancos) que não devem ser
commitados. Stagear por caminho explícito evita vazamento acidental.

## Verificações pré-merge (manual)

Antes de abrir/mergear uma PR que mexeu no frontend:

- [ ] `npm.cmd run lint` → 0 errors
- [ ] `npm.cmd run build` → built sem erro
- [ ] Diff de `backend/static/index.html` + `assets/` commitado em commit separado
- [ ] Nenhum diff em `backend/static/*-processor.js` que **não** tenha um diff correspondente
      em `frontend/public/*-processor.js` (ver próxima seção)
- [ ] Abrir o app, tocar uma faixa, abrir o diagnóstico — sem erros no console
- [ ] Se mexeu em worklet: testar Auto-Calib + Bass Torture + Seek/Tail Reset no painel

## Detecção de edição manual de `backend/static`

Sinais de que alguém editou `backend/static` direto (em vez de `frontend/public`):

```bash
# 1. Diff em static/*-processor.js sem diff correspondente em frontend/public:
git diff --name-only backend/static/ | sed 's|backend/static/|frontend/public/|'
# Se algum arquivo listado acima NÃO aparecer em 'git diff frontend/public/', é edição manual.

# 2. Hash de bundle no index.html não bate com o arquivo em assets/:
grep -o 'assets/index-[A-Za-z0-9_-]*\.js' backend/static/index.html
ls backend/static/assets/ | grep index
# O hash citado no index.html deve existir em assets/.
```

Se encontrar edição manual: **reaplicar a mudança em `frontend/public`** (ou `frontend/src`)
e rebuildar. Descartar o diff direto de `backend/static`.

## Verificações pré-build desktop (PyInstaller)

Antes de rodar `python backend/build_exe.py`:

- [ ] `backend/static` está atualizado com o último `npm run build` (passo acima)
- [ ] `backend/static/irs/*.wav` presentes (cópia de `frontend/public/irs/`)
- [ ] `backend/static/lumina-mastering.js` presente
- [ ] `backend/build_exe.py` **sem paths absolutos** (`C:/Users/...`) — resolvedor dinâmico
- [ ] Cookies (`cookies.txt`) **não** presentes ao lado do source (vazariam para o exe)
- [ ] `backend/downloads/`, `backend/downloads.db`, `backend/output.json` ausentes do empacotamento

```bash
# Sanity check: nenhum path absoluto de usuário no build_exe.py
grep -nE 'C:/Users|/Users/|/home/' backend/build_exe.py  # deve retornar vazio
```

## Problemas comuns

| Sintoma | Causa provável | Correção |
|---|---|---|
| Worklet novo não carrega no exe | Editado só em `backend/static`, perdido no build | Editar em `frontend/public` + rebuild |
| `index.html` referencia JS que não existe em `assets/` | Build parcial / merge conflitou hashes | Rebuild limpo |
| Build quebra em outra máquina | Path absoluto em `build_exe.py` | Resolver via `import` dinâmico (já corrigido pós-PR 3.1) |
| `backend/static` gigante no repo | Worklets/IRs duplicados e não-ignorados | São necessários (servidos pelo exe); não ignorar |

## Referência

- `docs/build-and-runtime.md` — visão geral do build Vite/PyInstaller
- `docs/project-structure.md` — distinção source vs artefato gerado
- `docs/risks-and-improvements.md` — R8.2 (`backend/static` frágil a edição manual)
