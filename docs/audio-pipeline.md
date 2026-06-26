# Cadeia de Áudio

## Visão geral

A cadeia de áudio atual vive principalmente em `frontend/src/components/PlayerBar.jsx`, com diagnóstico em `AudioDiagnosticsPanel.jsx`, testes offline em `frontend/src/utils/audioTortureRunner.js` e perfis em `frontend/src/audio/presets/autoCalibrationProfiles.js`.

## Cadeia atual

Hipótese baseada nas conexões observadas em `PlayerBar.jsx`:

```txt
HTMLAudio/MediaElement
→ seekTransitionGain / mixer bus
→ Source Quality Worklet, quando disponível
→ ReplayGain / Auto-Level
→ AutoEQ preamp
→ Biquad EQ bands
→ Headroom / PreGain
→ DSP Chain
   → occlusion/material filters
   → bass/sub processing
   → transient/adaptive/deesser/deharsh/exciter/spectral glue, quando ativos
   → saturation
   → submono
   → crossfeed
   → multiband stereo width
   → stereo depth
   → room/reverb/convolver/IR + wet filters
   → mastering/LUFS/spatial8D, quando disponíveis
→ Master Limiter
→ MasterOut / Peak Guard
→ A/B Comparator / StereoScope / telemetria em pontos da cadeia
→ Destination
```

Observação: alguns nós de comparação/telemetria são conectados em paralelo ou em pontos específicos, então a ordem acima é uma simplificação operacional.

## ReplayGain / Auto-Level

Há um `replayGainNode` no player. Ele representa ganho antes do AutoEQ e DSP principal. O objetivo é normalizar nível antes de efeitos mais sensíveis.

## AutoEQ / EQ

O player cria filtros `BiquadFilterNode`, incluindo bandas de EQ e preamp. O painel de diagnóstico recebe `eqFiltersRef` e verifica quantidade/estado de filtros.

Conceitos envolvidos:

- biquad filters;
- dB para ganho linear;
- gain staging;
- clamping de parâmetros.

## Presets e perfis

Os perfis de Auto-Calibração ficam em `autoCalibrationProfiles.js`:

- `limpo` / Som Limpo;
- `espacial`;
- `grave` / Mais Grave;
- `quente` / Mais Quente;
- `cinema`;
- `antifadiga` / Anti-Fadiga.

Cada perfil pode ajustar EQ, headroom, makeup, saturação, width, submono, reverb, espacialidade, deesser/deharsh e outros parâmetros.

## Headroom e Predictive Headroom

O arquivo de perfis exporta `calculateAnticipativeHeadroom`, que calcula `effectiveExtraHeadroomDb` e `makeupDb` com limite inferior de aproximadamente `-12 dB`.

Objetivo: evitar que presets fortes cheguem quentes demais antes do MasterOut, deixando o Peak Guard como airbag final.

Conceitos:

- gain staging;
- dB to linear conversion: `linear = 10^(dB/20)`;
- peak detection;
- clamping;
- margem de segurança.

## Bass Boost / Mais Grave

O perfil `grave` reduz headroom, limita makeup, usa submono e reduz risco de excesso estéreo em graves. Grave é sensível porque aumenta energia e pico percebido.

## Mais Quente / Saturação

O perfil `quente` usa saturação tipo tape e `saturationOutputTrimDb`. A saturação tem drive/mix e trim próprio para evitar depender do MasterOut como clipper.

## Cinema / Espaço

O perfil `cinema` usa reverb/spatial/depth com wet controlado, HPF no wet e headroom extra. A intenção documentada pelo código atual é largura/profundidade sem excesso de loudness.

## Anti-Fadiga

Usa redução de presença/agudos, deesser/deharsh e menor agressividade. O objetivo é reduzir aspereza, não aumentar loudness.

## Lo-Fi

Há presets/controles de caráter sonoro no player/equalizer. Esta documentação não encontrou um módulo isolado chamado Lo-Fi; quando aparecer na UI, deve ser tratado como combinação de EQ/saturação/filtros até revisão específica.

## Submono

Há `submono-processor.js` e integração com `multiband-width`. Usado para controlar graves em mono e reduzir risco de fase/energia lateral em baixas frequências.

## Crossfeed

`crossfeed-processor.js` mistura parte dos canais L/R para suavizar separação estéreo. O diagnóstico representa ganhos LR/RL.

## Reverb / IR

O player usa `ConvolverNode` e impulse responses em `frontend/public/irs/` e `backend/static/irs/`. Há filtros no wet path:

- HPF;
- mid EQ;
- high EQ;
- LPF.

Conceitos:

- convolution;
- wet/dry mix;
- reset de cauda por troca de IR ou reset de estados.

## Spatial / 8D / Stereo width

Há `spatial8d-processor.js`, `multiband-width-processor.js`, `depth-processor.js` e StereoScope. O sistema calcula/monitora correlação estéreo e phase risk.

Conceitos:

- mid/side matrix;
- phase correlation;
- stereo width;
- equal-power crossfade, quando há transições;
- exponential smoothing.

## Limiter

O player cria `DynamicsCompressorNode` como master limiter, com threshold perto de `-1 dB`, ratio alto e attack/release curtos. A redução é reportada em telemetria como `limiterReductionDb`.

## MasterOut / Peak Guard

`master-out-processor.js` é o airbag final. Ele mede picos, clip count, true peak mode e safe bypass. O objetivo correto é proteger emergências, não mascarar presets quentes.

## Telemetria

Fontes:

- `masterTelemetryRef`;
- `stereoTelemetryRef`;
- `sourceQualityTelemetryRef`;
- `multibandStereoTelemetryRef`;
- LUFS meter;
- AudioDiagnosticsPanel.

Métricas:

- peak dB;
- pre-master peak;
- clip count;
- limiter reduction;
- RMS;
- crest factor;
- phase correlation;
- underruns/CPU/governor risk.

## Performance Governor

O player monitora risco/CPU/underruns e pode bypassar recursos caros como transient/adaptive EQ em situação crítica. Isso reduz custo em tempo real, mas pode mudar timbre temporariamente.
