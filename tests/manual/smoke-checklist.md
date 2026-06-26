# Smoke Checklist Manual

## Objetivo
Validar funcionalidades críticas do Lumina de forma manual para evitar regressões.

## Ambiente do teste

## Antes de começar

## Teste 1 — Inicialização
- App abre sem erro crítico.
- Backend inicia.
- Frontend carrega.
- Nenhum erro vermelho crítico no console.
- Configurações principais aparecem.

## Teste 2 — Busca e /info
- Buscar uma música por texto.
- Abrir resultado.
- Confirmar título.
- Confirmar capa.
- Confirmar duração.
- Confirmar que resposta atrasada não sobrescreve a UI (pendente de confirmação).

## Teste 3 — Download simples
- Baixar uma música simples em MP3 ou formato padrão.
- Confirmar status queued/running/downloading/processing/done.
- Confirmar arquivo salvo.
- Confirmar item aparece na biblioteca.

## Teste 4 — Download consecutivo
- Adicionar pelo menos 2 links.
- Confirmar que o próximo item aparece visualmente antes da requisição terminar.
- Confirmar título/capa corretos do próximo item.
- Confirmar que a qualidade/modo são preservados.
- Confirmar que a UI não fica presa em processing/downloading.
- Confirmar fallback visual se o próximo link falhar.

## Teste 5 — Fila e status
- Verificar fila visual.
- Cancelar um job, se possível (pendente de confirmação).
- Confirmar status cancelled.
- Confirmar que job concluído vira done/completed corretamente.
- Confirmar que job com erro mostra erro sem travar fila.

## Teste 6 — Player básico
- Tocar música baixada.
- Pausar.
- Continuar.
- Trocar faixa.
- Usar seek.
- Confirmar que não há estalo/pop perceptível.
- Confirmar que currentTime/duration atualizam.

## Teste 7 — Player com presets
- Testar Som Limpo.
- Testar Mais Grave.
- Testar Mais Quente.
- Testar Cinema.
- Testar Anti-Fadiga.
- Testar Lo-Fi se disponível.
- Confirmar que não clipa audivelmente.
- Confirmar que volume não cai de forma absurda.

## Teste 8 — Diagnóstico de áudio
- Abrir painel de diagnóstico.
- Verificar MasterOut.
- Verificar clipCount.
- Verificar PeakPreMaster.
- Verificar limiterReduction.
- Verificar governorRisk.
- Rodar Auto-Calib se disponível.
- Rodar Seek/Tail Reset se disponível.

## Teste 9 — Health Snapshot
- Capturar Snapshot.
- Exportar JSON.
- Confirmar timestamp.
- Confirmar dados do player.
- Confirmar dados de áudio quando disponíveis.
- Confirmar path sanitizado.
- Confirmar que não exporta cookie/token/URL assinada.

## Teste 10 — Soak Test 5 minutos
- Iniciar Soak Test de 5 minutos.
- Confirmar snapshots a cada 60s.
- Confirmar status rodando.
- Confirmar risco atual.
- Confirmar alertas.
- Esperar concluir.
- Exportar JSON.
- Confirmar que UI não ficou pesada.
- Confirmar que logs não floodaram.

## Teste 11 — Logs e performance
- Deixar música tocando 10–15 minutos.
- Verificar se console não recebe spam por segundo.
- Confirmar que logs de DSP são throttled.
- Confirmar que log de faixa só muda quando troca a faixa.
- Confirmar que UI continua responsiva.

## Teste 12 — Build
- Rodar npm run build.
- Confirmar build passou.
- Aviso de chunk grande é aceitável.
- Confirmar backend/static atualizado somente quando esperado.

## Resultado final

## Resultado

Data:
Branch:
Commit:
Sistema:
Build passou:
Lint passou:
Smoke passou:
Soak passou:
Bugs encontrados:
Aprovado para PR/Merge:

## Bugs encontrados

## Aprovação
