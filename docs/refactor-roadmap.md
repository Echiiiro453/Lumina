# Roadmap de Refatoração

## Objetivo

Transformar os riscos atuais do Lumina/youtubeMusicDownload em uma sequência de PRs pequenas, seguras e revisáveis, preservando comportamento enquanto o projeto ganha organização, testes e contratos mais claros.

Este roadmap documenta direção futura. Ele não altera o código atual.

## Princípios

- Fazer PRs pequenas.
- Um tema por PR.
- Não misturar download, player e build na mesma PR.
- Rodar build/lint sempre.
- Documentar antes de mover.
- Preservar comportamento.
- Usar commits separados para build gerado.
- Não refatorar `PlayerBar.jsx` inteiro de uma vez.
- Não refatorar `backend/main.py` inteiro de uma vez.
- Não mexer em `backend/static` manualmente sem build.
- Não mexer em BGUtil/PO Token/Deno/Node sem teste no executável.
- Não esconder erro real de lint movendo código produtivo para ignore.

## O que não fazer

- Reescrever o player de uma vez.
- Trocar PyInstaller por Tauri no meio de refatoração de download.
- Mover helpers externos sem validar build final.
- Alterar nomes de estados de download sem compatibilidade.
- Alterar `/info`, `/download` ou `/ws` sem testes manuais.
- Editar worklets e UI na mesma PR.
- Misturar limpeza estrutural com mudança de comportamento.

## Fase 0 — Proteção da main e baseline

```txt
Objetivo:
Criar uma linha de base confiável antes de refatorar.

Arquivos envolvidos:
docs/, package.json, scripts de verificação se necessário.

O que pode mudar:
Documentação, scripts de verificação não invasivos, checklist de PR.

O que não pode mudar:
Fluxo de download, player, backend runtime, worklets e build desktop.

Riscos:
Baseline incompleto cria falsa segurança.

Testes obrigatórios:
npm run build; npm run lint; smoke manual de download/player se possível.

Critério de pronto:
Estado atual documentado, riscos conhecidos registrados e branch main protegida por processo de PR.
```

Itens:

- proteger `main`;
- exigir PR;
- documentar estado atual;
- registrar riscos;
- criar ou planejar `npm run verify`;
- registrar baseline de lint/build.

## Fase 1 — Higiene e lint

```txt
Objetivo:
Reduzir ruído sem mudar comportamento.

Arquivos envolvidos:
.gitignore, eslint.config.js, docs/, arquivos arquivados/experimentais.

O que pode mudar:
Ignorar builds/caches; mover scripts não produtivos; corrigir no-undef, hooks condicionais, chaves duplicadas, imports mortos simples.

O que não pode mudar:
Download, player, DSP, rotas, worklets, presets, build PyInstaller.

Riscos:
Esconder erro real de produção ou mover arquivo ainda usado.

Testes obrigatórios:
npm run lint; npm run build; git diff protegido.

Critério de pronto:
Lint crítico reduzido e arquivos não produtivos separados/ignorados de forma segura.
```

## Fase 2 — Logs, telemetria e performance de UI

```txt
Objetivo:
Reduzir spam, custo de render e risco de lag sem alterar DSP.

Arquivos envolvidos:
App.jsx, PlayerBar.jsx, AudioDiagnosticsPanel.jsx, LogViewerModal.jsx, logger futuro.

O que pode mudar:
Logger central, throttle, ring buffer, guard para painel fechado, redução de console repetitivo.

O que não pode mudar:
Cadeia WebAudio, parâmetros DSP, fallbacks de download.

Riscos:
Remover log útil para diagnosticar download/yt-dlp.

Testes obrigatórios:
Uso longo de player; abrir/fechar diagnóstico; download enquanto toca; build/lint.

Critério de pronto:
Logs sensíveis reduzidos, telemetria limitada e UI estável em sessão longa.
```

## Fase 3 — Contratos de API

```txt
Objetivo:
Padronizar como frontend fala com backend.

Arquivos envolvidos:
docs/api-contracts.md, futura camada frontend de API, App.jsx, modais, routers.

O que pode mudar:
Criar wrappers de API preservando payloads; padronizar tratamento de erro; documentar estados.

O que não pode mudar:
Semântica dos endpoints existentes sem compatibilidade.

Riscos:
Quebrar chamadas hardcoded ou endpoints duplicados.

Testes obrigatórios:
Busca, /info, download, cancelamento, biblioteca, settings, tags, mobile básico.

Critério de pronto:
Chamadas principais passam por camada comum ou estão documentadas; erros têm shape previsível.
```

Itens:

- criar camada frontend de API;
- mapear endpoints;
- padronizar estados de download;
- padronizar erros;
- revisar rotas duplicadas.

## Fase 4 — Download e fila

```txt
Objetivo:
Separar fila, estratégias, yt-dlp, FFmpeg e estados sem mudar resultado.

Arquivos envolvidos:
backend/downloader.py, backend/routers/downloads.py, App.jsx, QueueDrawer.jsx, QueueItem.jsx.

O que pode mudar:
Extrair serviços internos; padronizar estado; melhorar cancelamento; organizar fallbacks.

O que não pode mudar:
Qualidade final, ordem de fallback sem justificativa, contrato público sem compatibilidade.

Riscos:
Quebrar cookies, SABR, PO Token, cancelamento ou downloads simultâneos.

Testes obrigatórios:
URL normal, playlist, erro 403/429, cookies inválidos, cancelamento, simultâneo, MP3/FLAC/MP4, download consecutivo.

Critério de pronto:
Fila previsível, estados coerentes e fallbacks preservados/testados.
```

## Fase 5 — Backend `main.py` e routers

```txt
Objetivo:
Reduzir `main.py` gradualmente movendo endpoints para routers/services.

Arquivos envolvidos:
backend/main.py, backend/routers/*, services futuros.

O que pode mudar:
Mover endpoints por domínio com imports estáveis; remover duplicação só após compatibilidade.

O que não pode mudar:
Paths públicos, payloads, resposta esperada e startup/shutdown.

Riscos:
Duplicar rota em ordem diferente ou remover endpoint usado pelo frontend.

Testes obrigatórios:
Mapa de rotas antes/depois; smoke frontend completo; mobile/settings/library/tags/studio.

Critério de pronto:
Um domínio movido por PR, com rotas compatíveis e documentação atualizada.
```

## Fase 6 — PlayerBar e engine de áudio

```txt
Objetivo:
Separar UI da engine sem alterar som.

Arquivos envolvidos:
PlayerBar.jsx, AudioDiagnosticsPanel.jsx, EqualizerModal.jsx, frontend/src/audio/.

O que pode mudar:
Extrair hooks pequenos preservando conexões e parâmetros.

O que não pode mudar:
Ordem da cadeia, presets, worklet messages, headroom, limiter, Peak Guard.

Riscos:
Pop/click, queda de volume, telemetria quebrada, worklet sem parâmetro, leak de AudioNodes.

Testes obrigatórios:
Reprodução, seek, troca de faixa, Auto-Calib, Bass Torture, Seek/Tail Reset, diagnóstico aberto/fechado.

Critério de pronto:
Hooks extraídos com comportamento idêntico e testes de regressão passando.
```

Hooks candidatos:

- `useAudioEngine`;
- `usePlaybackControls`;
- `useHeadroomManager`;
- `useSeekTransition`;
- `useDSPTelemetry`;
- `usePerformanceGovernor`.

## Fase 7 — Diagnósticos e testes DSP

```txt
Objetivo:
Tornar testes mais fiéis ao player real e reduzir PASS falso.

Arquivos envolvidos:
audioTortureRunner.js, AudioDiagnosticsPanel.jsx, worklets, docs.

O que pode mudar:
Melhorar runner offline, separar métricas raw/pre/post, exportar relatórios, testes longos.

O que não pode mudar:
Não ajustar teste para mascarar bug real.

Riscos:
Teste offline divergir ainda mais ou ficar rígido demais.

Testes obrigatórios:
Auto-Calib, Seek/Tail Reset, Bass/Sibilance Torture, Crash Guard, sessão longa.

Critério de pronto:
Cada teste documenta o que valida e falhas indicam causa provável.
```

## Fase 8 — Build e empacotamento

```txt
Objetivo:
Tornar build reproduzível e claro.

Arquivos envolvidos:
frontend/vite.config.js, backend/build_exe.py, backend/static, bgutil_server, po_token, docs.

O que pode mudar:
Scripts de build, verificação de assets, documentação de runtime, smoke test de executável.

O que não pode mudar:
Sem trocar empacotador oficial sem PR dedicada.

Riscos:
Executável usar static antigo, helper ausente, path absoluto, dependência faltando.

Testes obrigatórios:
npm run build; PyInstaller; abrir exe; baixar; tocar; testar BGUtil/PO Token/cookies.

Critério de pronto:
Build em máquina limpa documentado e repetível.
```

## Fase 9 — Testes automatizados e CI

```txt
Objetivo:
Criar barreiras automáticas contra regressão.

Arquivos envolvidos:
GitHub Actions, tests, backend/tests, frontend config, docs.

O que pode mudar:
Adicionar CI lint/build/test; testes unitários e smoke.

O que não pode mudar:
Não depender de credenciais pessoais nem cookies reais.

Riscos:
CI instável por depender de YouTube/rede.

Testes obrigatórios:
Lint, build, testes backend, testes frontend, smoke sem rede quando possível.

Critério de pronto:
PR falha automaticamente em erro básico de lint/build/test.
```

## Critérios de sucesso

- Menos arquivos gigantes por responsabilidade.
- Contratos documentados e estáveis.
- Download preserva fallbacks e qualidade.
- Player preserva som e estabilidade.
- Build final reproduzível.
- Lint/build rodam em CI.
- Worklets e `backend/static` tratados com cuidado.

## Ordem recomendada de PRs

1. Documentação complementar.
2. Ajustes de `.gitignore`/higiene sem comportamento.
3. Lint crítico objetivo.
4. Camada de API frontend sem alterar payloads.
5. Padronização de estados de download com compatibilidade.
6. Extração pequena de fila frontend.
7. Extração pequena de serviços do downloader.
8. Mover um grupo de endpoints de `main.py` por vez.
9. Extração de hooks do player, um hook por PR.
10. Testes/CI/build smoke.

## Riscos de cada fase

- Fase 0: baseline incompleto.
- Fase 1: esconder erro real.
- Fase 2: perder log diagnóstico.
- Fase 3: quebrar contrato usado por modal esquecido.
- Fase 4: quebrar fallback/cancelamento.
- Fase 5: conflito de rotas.
- Fase 6: alterar som sem perceber.
- Fase 7: teste falso positivo/negativo.
- Fase 8: executável incompleto.
- Fase 9: CI flaky por rede/YouTube.
