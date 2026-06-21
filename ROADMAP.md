# Music Downloader - Roadmap de Features

## 🎯 Prioridade ALTA (Próximas Implementações)

- [x] **Playlist Manager Avançado**
  - [x] Backend: Endpoint para listar todos os vídeos da playlist (`/playlist/details`)
  - [x] Backend: Download playlist com seleção individual
  - [x] Frontend: UI para mostrar lista de vídeos
  - [x] Frontend: Checkboxes para selecionar músicas
  - [ ] Frontend: Progresso individual por música (Implementado progresso geral)
  - [x] Frontend: Contador "X de Y músicas selecionadas"

- [x] **Busca Integrada do YouTube**
  - [x] Backend: Endpoint de busca usando yt-dlp
  - [x] Frontend: Barra de pesquisa (Híbrida com URL)
  - [x] Frontend: Grid de resultados com thumbnails
  - [x] Frontend: Download direto do resultado

- [ ] **Sistema de Presets**
  - [ ] Backend: Salvar/carregar presets
  - [ ] Frontend: UI de criação de preset
  - [ ] Frontend: Dropdown de presets prontos
  - [ ] Presets padrão: Nightcore, Slowed, Podcast

- [x] **Download em Lote (Batch)**
  - [x] Backend: Fila de downloads
  - [x] Backend: Sistema de priorização
  - [x] Frontend: UI de fila com drag & drop (Implementado Menu Lateral de Fila)
  - [x] Frontend: Pausar/retomar/cancelar individual

## 🎨 UI/UX Improvements

- [ ] **Toast de Notificações Melhorado**
  - [ ] Animações de entrada/saída
  - [ ] Botão "Abrir Pasta" no toast
  - [ ] Som de conclusão opcional

- [ ] **Tema Claro/Escuro**
  - [ ] Toggle de tema na UI
  - [ ] Persistir preferência
  - [ ] Transição suave entre temas

- [ ] **Preview de Thumbnail Melhorado**
  - [ ] Thumbnail maior no hover
  - [ ] Info do canal/uploader
  - [ ] Views e data de publicação

- [ ] **Skeleton Loading**
  - [ ] Durante carregamento de info
  - [ ] Na lista de playlist
  - [ ] No histórico

## ⚡ Features Avançadas

- [ ] **Conversor de Formatos**
  - [ ] UI para selecionar arquivos baixados
  - [ ] Conversão sem re-download
  - [ ] Batch conversion

- [ ] **Legendas Automáticas**
  - [ ] Download de legendas (SRT/VTT)
  - [ ] Queimar legendas no vídeo
  - [ ] Seleção de idioma

- [ ] **Cache de Metadados**
  - [ ] SQLite para cache local
  - [ ] TTL configurável
  - [ ] Botão limpar cache

- [ ] **Download Paralelo**
  - [ ] Configurar limite de simultâneos
  - [ ] Medidor de uso de banda
  - [ ] Throttling opcional

## 🎵 Advanced DSP & Audio Features (Próximas Prioridades)

- [ ] **1. Headphone Correction / AutoEQ**
  - [ ] Perfis de fone pré-calibrados para nivelar a resposta em frequência.
  - [ ] Curvas de correção automáticas para os fones mais populares do mercado.

- [ ] **2. A/B Test Workflow com Loudness Igualado**
  - [ ] Comparação real-time entre áudio Original e Processado.
  - [ ] Compensação de Loudness para que o A/B seja honesto e focado na textura.

- [ ] **3. Convolution Reverb (Impulse Response)**
  - [ ] Implementar via `ConvolverNode` simulações de espaços reais (Igreja, Teatro, Caverna, Spring Reverb).
  - [ ] Expandir o atual Room procedural.

- [ ] **4. Stereo Vectorscope / Phase Meter**
  - [ ] Goniometer real-time (Gráfico de Lissajous) no painel de Diagnóstico.
  - [ ] Leitura instantânea de: Correlation, Width (%) e Risco de Fase (Phase Risk).

- [ ] **5. ReplayGain / Loudness Normalize Dinâmico**
  - [ ] Normalização pós-download com metadados (Integrar `-14 LUFS` ou `-16 LUFS`).
  - [ ] Adequar músicas antigas/clipadas no padrão de conforto atual.

- [ ] **Outras Ferramentas Profissionais na Fila**
  - [ ] Crossfeed Avançado (Delay, LPF).
  - [ ] Transient Shaper (Ataque/Sustain shaping).
  - [ ] Dynamic EQ Real / Multiband Compressor.
  - [ ] Declipper Automático para áudios do YouTube esmagados.
  - [ ] Toggle global entre Modo **Referência** (Zero Cor) e Modo **Criativo** (Spatial, Saturação, Room).

- [ ] **Detecção de BPM**
  - [ ] Librosa integration
  - [ ] Mostrar BPM na UI
  - [ ] Filtrar por BPM

## 📊 Analytics & Gestão

- [ ] **Dashboard de Estatísticas**
  - [ ] Total de downloads
  - [ ] GB baixados
  - [ ] Gráficos de uso
  - [ ] Top artistas/canais

- [ ] **Organizador Automático**
  - [ ] Criar pastas por artista
  - [ ] Padrão de renomeação configurável
  - [ ] Auto-tag com metadados

- [ ] **Backup & Sync**
  - [ ] Export/import de histórico
  - [ ] Sync com nuvem (opcional)
  - [ ] Restauração de configurações

## 🔧 Funcionalidades Técnicas

- [ ] **Agendador de Downloads**
  - [ ] Interface de agendamento
  - [ ] Cron-like syntax
  - [ ] Notificação ao completar

- [ ] **Modo Privado**
  - [ ] Toggle "modo anônimo"
  - [ ] Não salvar histórico
  - [ ] Auto-limpar ao fechar

- [ ] **Webserver Remoto**
  - [ ] API REST completa
  - [ ] UI mobile-friendly
  - [ ] QR Code para conexão

## 🌐 Integrações

- [ ] **Mais Plataformas** (SoundCloud, Bandcamp, TikTok, Instagram, Vimeo)
- [ ] **Importar Playlists Spotify** (Matching inteligente)
- [ ] **Editor ID3 Avançado** (MusicBrainz, Letras)

## 🎁 Extras

- [ ] **Player Integrado** (Waveform, Playback)
- [ ] **Modo Karaokê** (Spleeter)
- [ ] **Sistema de Plugins**

---

### 📝 Status Atual
**Implementado:** ✅
- Sistema de rotação de clientes
- Download básico de áudio/vídeo
- Pitch shifting
- Speed control
- Equalizer
- Trim/corte de vídeo
- Editor de metadata
- Histórico de downloads
- Upload de cookies
- Support para Spotify/Apple Music (Magic Search)
- Playlist Manager Avançado (Básico funcional ✅)
- [x] Migração para Android (React Native + Chaquopy) ✅
- [x] Empacotamento Profissional Desktop (PyWebView 100% Portátil) ✅
- [x] Proxy Survival Mode (Bypass de Bloqueios IP do YouTube) ✅
- [x] Memória de Fila (Resume Downloads Interrompidos) ✅
- [x] **Internacionalização (i18n)**: Suporte dinâmico para Inglês, Espanhol e Português. ✅
- [x] **Desduplicação Robusta**: Correção de persistência no DB para evitar re-downloads de singles. ✅
- [x] **Arquitetura de Subprocessos Isolados**: Prevenção de memory crashes e ghost UI clones ao processar Spotify/Apple Music. ✅
- [x] **Proteção Avançada contra IP Bans**: Jittering/Sleep estendido para buscas massivas no Spotify (`ytsearch`). ✅
- [x] **Ocultação de CMD**: Conversões FFmpeg e IA rodam de forma 100% invisível no Windows. ✅
- [x] **Persistência Dinâmica UI**: WebView2 corrigido para não limpar localStorage (preservando wallpapers e preferências) e wallpapers armazenados via rotas seguras `/data`. ✅

**Em Progresso:** 🔄
- Sistema de Presets (Configuração Rápida de Pitch/Speed)
