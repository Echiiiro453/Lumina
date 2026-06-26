# Riscos Conhecidos

Este documento lista riscos atuais sem corrigi-los.

## Arquitetura

- `frontend/src/App.jsx` concentra muito estado: busca, download, fila, WebSocket, modais e integração com player.
- `frontend/src/components/PlayerBar.jsx` concentra UI, WebAudio, DSP, worklets, telemetria, lyrics e Performance Governor.
- `backend/main.py` ainda é grande e contém muitas rotas diretas apesar da existência de routers.
- `backend/downloader.py` mistura fila, yt-dlp, FFmpeg, retries, metadados, lyrics, banco e Telegram.
- Existem arquivos de backup/refactor em `frontend/src`.
- Existem projetos terceiros dentro de `backend/`, o que dificulta distinguir produção, vendor e experimento.
- Há acoplamento forte entre `frontend/public` e `backend/static`.

## Download

- A lista de fallbacks é longa e pode mascarar regressões.
- O fallback SABR depende de BGUtil/PO Token/helper local.
- Cookies inválidos podem quebrar busca/info/download.
- Token expirado ou helper externo morto pode parecer bug de yt-dlp.
- Há risco de rotas duplicadas em `stream.py` e entre routers/main.
- Cancelamento depende de estado e do progress hook interromper o yt-dlp.
- Downloads simultâneos podem competir por nome/path se o título repetir.
- Arquivos temporários podem sobrar em erro.
- O executável final precisa incluir binários e helpers corretos.

## Player/DSP

- Logs/telemetria em alta frequência podem impactar performance.
- Worklets em `frontend/public` são código real e podem ser ignorados por engano.
- Teste offline pode divergir do player real.
- Headroom/presets fortes podem deixar áudio baixo demais ou quente demais.
- Peak Guard pode mascarar distorção se usado como compressor principal.
- Presets acima de 100% exigem proteção própria.
- Longa duração pode revelar leaks de AudioNodes, listeners ou intervals.
- Seek/troca de faixa exige reset consistente de worklets e caudas.

## Build

- `npm run build` sobrescreve `backend/static`.
- Editar `backend/static` manualmente é frágil.
- PyInstaller usa `--add-data`, hidden imports e paths específicos.
- `build_exe.py` contém path absoluto para Vosk.
- Dependências como FFmpeg, Node, Deno/BGUtil e yt-dlp precisam estar disponíveis no executável.
- Dev Vite e executável podem usar arquivos diferentes se build não for refeito.
- Tauri existe, mas não parece ser o build oficial atual.

## Segurança/local

- `cookies.txt` é sensível.
- `backend/output.json` pode conter saída sensível dependendo da ferramenta.
- URLs assinadas, headers, tokens e cookies não devem ir para logs.
- `file_path` vindo de APIs precisa ser tratado com cuidado para evitar path traversal.
- Downloads contêm arquivos pessoais do usuário.
- Abrir arquivos/pastas pelo backend exige validação de path.
- Nome de música/artista pode conter caracteres problemáticos.

## Testes

- Não há evidência de CI completo.
- Testes manuais estão dispersos.
- Lint ainda possui backlog conhecido.
- Poucos testes automatizados cobrem build desktop.
- Testes de download dependem de YouTube, rede, cookies e IP.
- Testes de áudio podem passar offline e falhar no player real se a cadeia divergir.

## Revisão humana recomendada

- Contratos frontend/backend de download.
- Rotas duplicadas em `main.py` e routers.
- Ordem dos fallbacks yt-dlp.
- Empacotamento de `bgutil_server`, `po_token`, Deno/Node.
- Worklets e equivalência `frontend/public` ↔ `backend/static`.
- Segurança de cookies/logs/path.
