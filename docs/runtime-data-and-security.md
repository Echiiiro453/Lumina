# Dados de Runtime e Segurança Local

## Visão geral

O Lumina manipula mídia local, cookies, banco SQLite, logs, outputs de yt-dlp/FFmpeg, tokens mobile, paths de arquivos e helpers externos. Este documento registra riscos atuais e cuidados para evitar vazamento de dados pessoais ou arquivos gerados no Git/API/logs.

Não altera o comportamento do app.

## Dados locais do usuário

Dados observados ou esperados:

- `backend/downloads/`: músicas/vídeos baixados.
- `downloads.db`: banco SQLite no diretório de dados retornado por `get_data_dir()`.
- `history.json`: citado como dado local esperado; localização atual não confirmada.
- `cookies.txt`: cookies do usuário.
- `backend/output.json`: output local/sensível potencial.
- `debug/`: logs locais.
- `backend/bgutil_node.log`: log citado como possível runtime; existência atual não confirmada.
- wallpapers locais, como `backend/custom_wallpaper.*`.
- arquivos temporários de FFmpeg, como `.trimmed.tmp`.
- `backend/deno/`: runtime/cache local.
- `backend/test_out/`.
- `backend/split_output/`.
- `backend/static/`: build gerado, não dado pessoal por si só.
- `backend/dist/` e `backend/build/`: build desktop.

## Cookies e autenticação

Cookies podem existir em:

- raiz do projeto, como `cookies.txt`;
- diretório de dados do usuário via `get_data_dir()/cookies.txt`;
- caminhos enviados por request em `cookies_path`;
- potencialmente cópias manuais usadas em testes.

Uso atual:

- `auth_status` verifica se o arquivo parece Netscape cookie file.
- `upload_cookies` salva cookies em diretório de dados.
- yt-dlp usa `cookiefile` em busca, info e download.

Riscos:

- cookies dão acesso à sessão do usuário;
- podem conter tokens de autenticação;
- podem ser vazados por log, commit, zip ou relatório;
- cookies inválidos podem quebrar busca/download.

Recomendação documental:

- não versionar;
- manter em diretório de dados do usuário;
- nunca imprimir conteúdo;
- exibir apenas estado autenticado/não autenticado.

## Banco de dados local

`backend/database.py` cria SQLite em:

```txt
DB_PATH = os.path.join(get_data_dir(), "downloads.db")
```

Tabelas:

- `downloads`;
- `app_settings`;
- `favorites`;
- `jobs_queue`.

Pode conter:

- títulos;
- caminhos de arquivos;
- URLs;
- histórico;
- settings;
- tokens/configurações como Telegram/Last.fm dependendo da função.

Risco: banco pode revelar biblioteca, hábitos de uso e paths pessoais.

## Pasta de downloads

`backend/downloads/` ou pasta configurada por settings contém mídia pessoal. Não deve ser apagada/movida por tarefas de higiene.

Riscos:

- arquivos grandes;
- nomes com caracteres especiais;
- arquivos incompletos;
- duplicatas;
- path traversal se endpoints aceitarem nomes sem validação;
- exposição por mobile zip/download.

## Arquivos temporários

Exemplos:

- `*.tmp`;
- `*.temp`;
- `full_final_path + ".trimmed.tmp"`;
- zips temporários mobile criados por `tempfile.NamedTemporaryFile`;
- instalador Python baixado por Studio;
- outputs Demucs em pasta Studio.

Devem ser limpos após uso, mas a limpeza pode falhar em crash/timeout.

## Logs

Possíveis fontes:

- console backend;
- `debug/`;
- `backend/bgutil_node.log` (não confirmado);
- LogViewer via `/api/logs`;
- stderr/stdout de FFmpeg, Demucs, yt-dlp;
- telemetry frontend.

Pode logar:

```txt
status geral
job_id
tipo de erro
tempo de execução
nome sanitizado de estratégia
progress percentual
```

Não deve logar:

```txt
cookies
headers sensíveis
URL assinada completa
tokens
paths pessoais completos
stderr completo do FFmpeg quando contém paths
resposta bruta de yt-dlp
```

## yt-dlp output e URLs assinadas

Saídas completas de yt-dlp podem conter:

- URLs assinadas;
- IP ou informações de conexão;
- headers;
- parâmetros temporários;
- dados de sessão;
- lista de formatos;
- legendas;
- informações internas do extractor.

Recomendações:

- não versionar outputs;
- não expor resposta bruta em API pública;
- evitar log completo;
- sanitizar antes de salvar relatório;
- preferir mensagens resumidas para UI.

## FFmpeg/FFprobe

FFmpeg/FFprobe recebem paths locais e podem imprimir paths completos no stderr. Também podem processar arquivos grandes por muito tempo.

Riscos:

- leak de path pessoal em erro;
- subprocess sem timeout;
- consumo alto de CPU/RAM;
- path com espaços/acentos;
- arquivo malformado travando análise/conversão.

Recomendação:

- usar lista de argumentos, como já ocorre em vários trechos;
- impor timeout onde possível;
- não retornar stderr bruto ao usuário sem sanitização.

## Paths locais e path traversal

Vários endpoints recebem `file_path`, `input_path` ou nomes de arquivo. Isso é sensível porque o backend roda com acesso local.

Riscos:

- path traversal com `../`;
- path absoluto fora da biblioteca;
- UNC/rede;
- abertura de arquivo arbitrário;
- zip incluindo arquivo fora de downloads;
- conversão de arquivo não autorizado.

## APIs que recebem `file_path`

Endpoints/chamadas observados:

- `POST /api/open_external` com `{ file_path }`;
- `POST /api/play_external` com `{ file_path }`;
- `GET /api/tags/read?file_path=...`;
- `POST /api/tags/save` com `file_path`;
- `POST /api/tags/fetch_lyrics` com `file_path`;
- `GET /api/track_metadata?file_path=...`;
- `POST /api/fix_metadata` com `{ file_path }`;
- `POST /api/studio/split` com `{ file_path }`;
- `POST /api/convert` com `{ input_path, output_format }`;
- `POST /api/downloads/zip/start` com `{ files }`;
- `GET /downloads/{path}` ou rotas estáticas/downloads, conforme uso frontend; implementação exata não confirmada neste documento.

## WebSocket e telemetria

`/ws` envia estado global de jobs e eventos especiais. Telemetria de player pode ser enviada para `/api/telemetry`.

Riscos:

- job pode conter filename/path relativo;
- erro pode conter trecho sensível;
- eventos fora de ordem podem confundir UI;
- telemetria em excesso pode gerar log volumoso.

## Dados que nunca devem ser versionados

```txt
**/cookies.txt
**/cookies-*.txt
backend/downloads/
backend/output.json
backend/downloads.db
backend/history.json
backend/deno/
backend/test_out/
backend/split_output/
debug/
*.log
*.tmp
*.temp
*.tsbuildinfo
```

Também evitar:

- zips de diagnóstico com logs brutos;
- outputs de yt-dlp;
- bancos SQLite reais;
- wallpapers pessoais;
- downloads de usuário.

## Dados que podem ir para logs

```txt
job_id
status resumido
nome de estratégia sem segredo
percentual de progresso
tipo de erro resumido
tempo de execução
contagem de tentativas
modo audio/video
qualidade selecionada
```

## Dados que não podem ir para logs

```txt
cookies
Authorization headers
tokens de mobile/Telegram/serviços externos
URL assinada completa
querystring sensível
path absoluto do usuário
resposta bruta de yt-dlp
stderr completo com paths pessoais
conteúdo de banco SQLite
```

## Gitignore

O `.gitignore` deve proteger:

```txt
**/cookies.txt
**/cookies-*.txt
backend/downloads/
backend/output.json
backend/downloads.db
backend/history.json
backend/deno/
backend/test_out/
backend/split_output/
*.log
*.tmp
*.temp
*.tsbuildinfo
```

Observação: `archive/`, `tools/`, `tests/manual/` e `docs/` podem ser versionados quando contêm documentação/scripts sem dados pessoais.

## Checklist de segurança local

1. Verificar se o arquivo é dado do usuário antes de mover/remover.
2. Nunca commitar cookies ou banco real.
3. Sanitizar logs antes de anexar em issue/PR.
4. Não expor URL assinada completa.
5. Não retornar path absoluto em erro público.
6. Evitar stderr bruto de FFmpeg/yt-dlp na UI.
7. Validar token mobile antes de listar/zipar downloads.
8. Limitar concorrência de jobs pesados.
9. Testar paths com espaço/acento.
10. Confirmar build final sem dados locais embutidos.

## Checklist antes de criar endpoint de arquivo

```txt
1. Resolver Path real.
2. Verificar se existe.
3. Verificar se é arquivo.
4. Verificar se está dentro de raiz permitida.
5. Bloquear path fora da biblioteca/downloads.
6. Bloquear UNC/rede se não suportado.
7. Não retornar path completo em erro público.
8. Usar timeout para FFmpeg/FFprobe.
9. Limitar concorrência.
10. Não rodar subprocess sem limite.
```

## Pontos não confirmados

- Local exato de `history.json`.
- Existência atual de `backend/bgutil_node.log`.
- Implementação exata de `/downloads/{path}`.
- Se todos os endpoints que recebem path validam raiz permitida.
- Se todos os subprocessos possuem timeout.
