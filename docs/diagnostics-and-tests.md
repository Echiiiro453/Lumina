# Diagnósticos e Testes

## Visão geral

O projeto possui diagnósticos internos de áudio no frontend, testes offline em JavaScript e testes manuais em Python. Não há evidência de CI completo cobrindo download, player, build desktop e DSP.

## Painel de diagnóstico de áudio

Arquivo principal:

- `frontend/src/components/AudioDiagnosticsPanel.jsx`

Ele recebe refs do player e exibe/verifica:

- MasterOut telemetry;
- LUFS;
- source quality;
- StereoScope/vectorscope;
- multiband stereo;
- limiter reduction;
- clip count;
- headroom;
- governor risk;
- chain status;
- Auto-Calibração.

## MasterOut telemetry

Vem de `master-out-processor.js` e refs em `PlayerBar.jsx`. Métricas observadas:

- `peakDb`;
- `peakPreMasterDb`;
- `clipCount`;
- `truePeakMode`;
- `safeBypassActive`;
- `limiterReductionDb`;
- CPU/underruns/governor fields.

## StereoScope e ABCompare

Worklets/áreas relacionadas:

- `stereo-scope-processor.js`;
- `ab-comparator-processor.js`;
- refs `stereoTelemetryRef`, `stereoScopeRef`.

Validam correlação, fase, largura e comparação entre referência/processado.

## Multibanda

`multiband-width-processor.js` mede/controla largura por bandas e submono. Importante para graves, fase e perfis como Mais Grave.

## Source Quality

`source-quality-processor.js` coleta sinais para diagnóstico de qualidade/risco de fonte. O painel exibe suspeitas como transcode/lossy conforme telemetria.

## Testes offline

Arquivo:

- `frontend/src/utils/audioTortureRunner.js`

Suites observadas:

- `QUICK`;
- `FULL`;
- `TORTURE`;
- `AUTOCALIB`.

## Testes Auto-Calib

Validam perfis:

- Som Limpo;
- Espacial;
- Mais Grave;
- Mais Quente;
- Cinema;
- Anti-Fadiga.

Critérios incluem clip count, limiter GR, peak final e pre-master peak. O runner usa perfis de `autoCalibrationProfiles.js` e cálculo de headroom antecipativo.

## Seek / Tail Reset

Teste com impulso, delay/feedback e fade de seek. Valida que transição e reset de cauda não geram clip e mantêm pico pre-master dentro do limite.

## Bass Torture

Usa sinal com 40 Hz, 60 Hz e kick/click. Valida grave, submono, saturação, ReplayGain, peak, limiter e correlação.

## Sibilance Torture

Usa sinal com energia em 8 kHz e ruído. Valida deesser/deharsh/exciter/AutoEQ e evita clipping.

## Crash Guard

Teste de proteção contra falha de AudioWorklet/chain. O objetivo é verificar se há fallback/safe mode e se o áudio não some completamente.

## Soak Test

O painel menciona diagnósticos/performance governor, mas não foi identificado um soak test automatizado completo fora das rotinas internas. Hipótese: soak é manual ou integrado ao painel.

## Testes manuais

Pasta:

- `tests/manual/download/`
- `tests/manual/results/`

Arquivos:

- `test_dist_cookies.py`
- `test_user_case.py`
- `test_yt.py`
- `test_yt_battery.py`
- `battery_results.txt`

Eles parecem focar download/cookies/YouTube, mas devem ser revisados antes de uso como regressão oficial.

## O que cada teste valida

- Testes offline de áudio validam cadeia simulada, clipping, peaks, fase e alguns worklets.
- Painel de diagnóstico valida estado do player real em runtime.
- Testes manuais validam casos específicos de download.

## O que não valida

- Executável PyInstaller completo;
- todos os fallbacks reais do YouTube;
- expiração de token/cookies;
- uso longo de CPU/RAM;
- cancelamento em todos os momentos;
- igualdade perfeita entre cadeia offline e player real;
- metadados/tags em todos os formatos.

## Possíveis falsos positivos

- OfflineAudioContext pode divergir da cadeia real.
- Peak Guard pode mascarar problema se o teste olhar só saída final.
- Clip count acumulado sem reset pode falhar indevidamente.
- Resposta de WebSocket fora de ordem pode parecer bug de download.
- YouTube pode falhar por rede/IP/cookies e não por regressão.

## Como rodar

Frontend:

```bash
cd frontend
npm run build
npm run lint
```

Testes manuais Python:

```bash
python tests/manual/download/test_yt.py
python tests/manual/download/test_yt_battery.py
```

Hipótese: alguns testes manuais dependem de backend rodando, cookies e caminhos locais.

## Exportar relatório

O painel de diagnóstico possui dados suficientes para export/relatório, mas o caminho exato deve ser confirmado na UI atual. O arquivo `battery_results.txt` indica que resultados manuais podem ser salvos em `tests/manual/results/`.
