# Lumina Music Downloader - Visão Geral Técnica & Arquitetura

Este documento detalha o ecossistema tecnológico e as engenharias avançadas integradas no Lumina Music Downloader. Ele serve como o guia definitivo do que roda "por baixo dos panos" do aplicativo, detalhando os métodos que usamos para contornar as restrições de plataformas e oferecer a melhor experiência possível.

## 1. O Motor de Extração (YouTube Bypass Stack)
O coração do Lumina não é um simples baixador; é uma verdadeira "Santíssima Trindade" projetada para contornar as restrições mais agressivas do YouTube:

* **SABR (Server Adaptive Bit Rate):** 
  * **Problema:** O YouTube limita a banda (Throttling) e a resolução (cravando em 1080p) no protocolo HTTP DASH padrão para usuários não-premium.
  * **Solução:** O Lumina injeta um `PO Token` (Proof of Origin) do tipo `base64url` estrito (`aGVsbG8gd29ybGQh`) via argumentos do Extrator Web, forçando o servidor do YouTube a nos devolver o stream do protocolo SABR em formato Protobuf.
  * **Resultado:** Desbloqueio de downloads ultrarrápidos em **4K (2160p)** e **2K (1440p)** tanto para Transmissões ao Vivo (Lives) quanto para Vídeos Normais (VODs).

* **Deno/Node.js + Plugin EJS:**
  * **Problema:** O YouTube embaralha a assinatura do vídeo (`n-sig`) para bloquear scripts e robôs de raspar os links diretos.
  * **Solução:** Embutimos um runtime JavaScript que executa o código nativo do YouTube localmente para resolver o desafio criptográfico instantaneamente.

* **Injeção de Cookies:**
  * **Problema:** Vídeos com restrição de idade (NSFW) ou bloqueio regional.
  * **Solução:** Repassamos os cookies do usuário simulando sessão logada autêntica, eliminando totalmente a barreira de idade.

## 2. Acelerador de Download Multithread (Aria2c)
Não usamos a biblioteca de download nativa do Python. Em vez disso, o Lumina engatilha o **Aria2c**, que quebra o vídeo/áudio em dezenas de pedaços (segmentos) simultâneos. Combinado com o protocolo SABR, isso satura a banda da internet do usuário garantindo o menor tempo de download possível. O progresso é parseado de forma nativa e enviado ao frontend.

## 3. Inteligência Artificial e Processamento Local
* **Isolamento Vocal (Demucs):** O Lumina possui um auto-instalador que configura um ambiente virtual seguro para processar a separação de faixas (Voz vs Instrumental). Ele gerencia dependências complexas (PyTorch, Torchaudio) e executa o processamento pesado no backend de forma assíncrona, não travando a interface gráfica.
* **Shazam (Reconhecimento Acústico):** Integração com APIs reversas do Shazam para descobrir os metadados de qualquer música baseando-se em sua "impressão digital" em áudio.

## 4. Frontend & Design UI (Material You)
O visual do Lumina não é estático.
* **Motor Monet:** Adotamos os princípios do Material Design 3 (Material You). O aplicativo extrai de forma inteligente as cores predominantes das capas dos álbuns.
* Essas cores são transformadas em uma paleta HSL e injetadas como variáveis dinâmicas no CSS (Dark Mode/Light Mode).
* Elementos de vidro (Glassmorphism), controles modais, e barras de progresso herdam essas cores, tornando o reprodutor um aplicativo que parece nativo, vivo e com padrão de qualidade impecável.

## 5. Compilação e Distribuição (PyInstaller + Tauri)
O aplicativo é montado para ser "Zero-Setup" (Portátil) para o usuário final.
* Todo o backend Python é envelopado em um executável monolítico (`Lumina.exe`) usando PyInstaller.
* **O que vai junto:** Dentro desse `.exe`, nós embutimos silenciosamente binários gigantescos como o `ffmpeg` (para conversão e muxing de vídeos 4K), o `node.exe` (pro JS challenge) e o `aria2c.exe` (pra download). O usuário clica e tudo funciona sem precisar instalar nada no Windows.

## 6. Sincronização de Letras (Lyrics)
Um robusto sistema interno que constrói queries otimizadas removendo sujeiras ("Official Video", "Remastered") e rastreia na web as letras sincronizadas (`.lrc`), embutindo essas letras diretamente no contêiner final do arquivo (FLAC/MP3) e também rodando dinamicamente no miniplayer em tempo real.

## 7. Lumina Audio Engine (DSP & Mastering)
O motor de áudio nativo rodando dentro do frontend foi desenvolvido para entregar qualidade de nível audiófilo e precisão de engenharia sonora via `AudioWorklet`:
* **ReplayGain (Volume Leveling):** Um sistema avançado de pré-ganho inteligente que lê os metadados dinâmicos e calibra a altura do som via `setTargetAtTime`, garantindo transições suaves (click-free) e nível de energia consistente entre as faixas, não importa a origem.
* **AutoEQ (Headphone Correction):** Calibração de hardware através de cascatas de dezenas de `BiquadFilterNode` que processam arquivos de equalização baseados nos alvos Harman. Protege o headroom com o algoritmo `sanitizeHeadphoneProfile` aplicando Pre-Amp Reduction automático para evitar clipping.
* **Cadeia DSP Avançada:** Módulos de processamento de ponta como *Spatial 8D Panner*, *Room Convolver* (com proteção de Wet Hard-Cap Limit para espaços extremos), e processadores cirúrgicos como *Spectral Glue*, *Phase Rotation*, e Exciter operando com telemetria rigorosa.
* **A/B Comparator & Telemetria:** Um módulo profissional com Equal-Power Crossfade (cos/sin blending) e Null/Diff RMS (Teste Nulo). Permite alternar transparentemente entre áudio original, referência calibrada e sinal processado para tomar decisões puramente musicais sem mentiras de volume.
* **Vectorscope & Phase Meter:** Monitoramento dinâmico estéreo baseando-se nas amplitudes `Mid/Side` com rastreio da correlação (`sumLR / Math.sqrt(...)`). Renderizado em Canvas através de buffers de alta frequência (~10fps), alerta automaticamente contra cancelamentos de fase (*Mono Incompatible*).
* **Master Safety:** Pipeline final equipada com um Peak/True-Peak Limiter inviolável e medidor LUFS/RMS de classe internacional, certificando de que independentemente da maluquice dos ajustes do usuário, o som sairá polido e protegido de distorções e engasgos.

---
**Status Atual do Projeto (v4.2.0):** Preparado para escala de produção, sendo simultaneamente um extrator poderoso com todas as defesas do YouTube quebradas via bypasses sistêmicos e uma Estação de Trabalho de Áudio Analítica de altíssima precisão com UI Material You de ponta.
