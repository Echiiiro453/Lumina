# Estrutura do Frontend

## Visão geral

O frontend fica em `frontend/` e usa React, Vite, Tailwind, Framer Motion e Axios. O ponto de entrada é `frontend/src/main.jsx`, que renderiza `App.jsx`.

## Estrutura de `frontend/src`

- `App.jsx`: tela principal e estado global.
- `main.jsx`: bootstrap React.
- `index.css` e `App.css`: estilos globais.
- `i18n.js`: traduções e textos.
- `components/`: modais, player, fila, biblioteca e UI.
- `hooks/`: hooks específicos, atualmente inclui `useDownloadStatus.js`.
- `utils/`: utilitários, tema e suíte offline de testes de áudio.
- `audio/presets/`: perfis de Auto-Calibração.
- `assets/`: imagens locais.

Também existem backups/scripts em `frontend/src`, como `App.jsx.backup*` e `refactor*.py`. Eles devem ser tratados como não produção até revisão humana.

## `App.jsx`

Atualmente concentra:

- tela de busca/URL;
- carregamento de metadata via `/info`;
- busca via `/search`;
- estado de download principal;
- fila/batch download;
- função de download consecutivo simples;
- conexão WebSocket `/ws`;
- integração com biblioteca/histórico/configurações;
- modais globais;
- gerenciamento de idioma, tema, wallpaper, termos e autenticação/cookies;
- passagem de props para `PlayerBar`.

É um arquivo grande e sensível. Pequenas mudanças nele podem afetar download, UI, biblioteca, player e estado global.

## Componentes principais

- `PlayerBar.jsx`: player e cadeia WebAudio/DSP.
- `AudioDiagnosticsPanel.jsx`: diagnósticos e testes internos de áudio.
- `EqualizerModal.jsx`: controles de EQ, DSP, presets e parâmetros de áudio.
- `LibraryModal.jsx`: biblioteca local, favoritos, stream/play/download.
- `SettingsModal.jsx`: configurações, cookies, pasta de download, Last.fm/Telegram e voz.
- `QueueDrawer.jsx` e `QueueItem.jsx`: fila visual de downloads.
- `PlaylistModal.jsx`: detalhes de playlist e seleção de vídeos.
- `SpotifyModal.jsx`: importação de Spotify/Apple/SoundCloud.
- `StudioModal.jsx`: separação de stems/Demucs e jobs studio.
- `TagEditorModal.jsx`: tags/letras.
- `AudioTrimmerModal.jsx`: corte de áudio.
- `ConverterModal.jsx`: conversão local.
- `MobileSyncModal.jsx`: pareamento mobile.
- `TopAppBar.jsx`, `UIComponents.jsx`, `Ripple.jsx`, `WindowControls.jsx`: UI compartilhada.

## Hooks existentes

- `frontend/src/hooks/useDownloadStatus.js`: hook relacionado a status de download. Deve ser revisado junto ao fluxo de fila antes de refatorações.

## Utilitários

- `frontend/src/utils/theme.js`: tema/cores.
- `frontend/src/utils/audioTortureRunner.js`: testes offline de DSP/AudioWorklets, Auto-Calibração, Seek/Tail Reset e tortures.

## API calls

Não há uma camada única centralizada de API. As chamadas aparecem principalmente em:

- `App.jsx`;
- modais como `LibraryModal`, `SettingsModal`, `StudioModal`, `SubscriptionsModal`, `TagEditorModal`;
- componentes de fila.

Isso cria acoplamento direto entre UI e contratos backend.

## Presets e Auto-Calibração

Os perfis atuais de Auto-Calibração ficam em:

- `frontend/src/audio/presets/autoCalibrationProfiles.js`

Esse arquivo exporta perfis como `limpo`, `espacial`, `grave`, `quente`, `cinema`, `antifadiga`, além de lógica de headroom antecipativo e headroom temporário de seek.

## `PlayerBar.jsx`

Atualmente concentra:

- UI do player;
- estado de reprodução;
- criação e conexão da cadeia WebAudio;
- carregamento de AudioWorklets;
- ReplayGain/Auto-Level;
- AutoEQ/EQ;
- Bass Boost;
- saturação;
- submono;
- crossfeed;
- stereo width/multibanda;
- reverb/convolver/IR;
- spatial/8D;
- A/B Comparator;
- StereoScope;
- Master Limiter;
- MasterOut/Peak Guard;
- telemetria;
- lyrics;
- seek e reset de estados DSP;
- Performance Governor.

É um dos arquivos mais críticos do projeto.

## `AudioDiagnosticsPanel.jsx`

Responsável por:

- verificar nós da cadeia WebAudio;
- exibir telemetria de MasterOut, LUFS, source quality, stereo scope e governor;
- aplicar perfis de Auto-Calibração;
- rodar ou acionar testes internos;
- expor dados como clip count, peak, limiter reduction e phase risk.

## `frontend/public`

Contém assets públicos e worklets produtivos. Arquivos relevantes:

- `master-out-processor.js`
- `stereo-scope-processor.js`
- `saturation-processor.js`
- `submono-processor.js`
- `crossfeed-processor.js`
- `spatial8d-processor.js`
- `source-quality-processor.js`
- `lufs-meter-processor.js`
- `multiband-width-processor.js`
- `room-telemetry-processor.js`
- `adaptive-eq-processor.js`
- `deesser-processor.js`
- `deharsh-processor.js`
- `depth-processor.js`
- `exciter-processor.js`
- `transient-processor.js`
- `spectral-glue-processor.js`

Também contém `audio-tests*.html` e `irs/*.wav`.

## Relação `frontend/public` → `backend/static`

Durante `npm run build`, Vite copia assets públicos para `backend/static`. Assim, o executável/backend final usa `backend/static`, mas o desenvolvimento usa `frontend/public`.

Risco: editar apenas `backend/static` pode funcionar no executável local até o próximo build, mas a mudança será perdida. Editar apenas `frontend/public` exige rebuild para refletir em `backend/static`.
