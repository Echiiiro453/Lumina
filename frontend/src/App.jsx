import React, { useState, useEffect } from 'react';
import BackgroundMedia from './components/BackgroundMedia';
import TopAppBar from './components/TopAppBar';
import QueueDrawer from './components/QueueDrawer';
import SpotifyModal from './components/SpotifyModal';
import { t, getLanguage, setLanguage } from './i18n';
import { Search, Download, Music, AlertCircle, CheckCircle, ArrowRight, ArrowRightLeft, Settings, Upload, FileText, Check, Scissors, Sliders, X, List, Trash2, Plus, PlayCircle, Minimize2, Save, FolderOpen, AlertTriangle, Info, Power, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Heart, Copy, Github, RefreshCw, Wand2, Clock, Menu, Mic, Smartphone, BellRing, ClipboardPaste, ListPlus } from 'lucide-react';
import { RippleButton } from './components/Ripple';
import { QueueItem } from './components/QueueItem';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { WindowControls } from './components/WindowControls';
import qrcodeImg from './assets/qrcode_custom.jpg';
import { applyThemeFromImage, resetTheme } from './utils/theme';

import { SettingsModal } from './components/SettingsModal';
import { UpdateModal } from './components/UpdateModal';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistModal } from './components/PlaylistModal';
import { TermsModal } from './components/TermsModal';
import { LibraryModal } from './components/LibraryModal';
import StudioModal from './components/StudioModal';
import ShazamModal from './components/ShazamModal';
import { HistoryModal } from './components/HistoryModal';
import { ConverterModal } from './components/ConverterModal';
import MobileSyncModal from './components/MobileSyncModal';
import { SubscriptionsModal } from './components/SubscriptionsModal';
import { TagEditorModal } from './components/TagEditorModal';
import { SkeletonCard, SkeletonPlaylistItem, QualityOption, ToastContainer } from './components/UIComponents';
// Helper para detectar modo automaticamente (Music vs Video)
const detectMode = (url) => {
  if (!url) return 'video';
  const lowerUrl = url.toLowerCase();
  
  // Forçar modo Vídeo para Redes Sociais
  if (lowerUrl.includes('tiktok.com') ||
      lowerUrl.includes('instagram.com') ||
      lowerUrl.includes('twitter.com') ||
      lowerUrl.includes('x.com')) {
      return 'video';
  }
  
  if (lowerUrl.includes('music.youtube.com') ||
    lowerUrl.includes('shorts') ||
    lowerUrl.includes('soundcloud.com') ||
    lowerUrl.includes('bandcamp.com') ||
    lowerUrl.includes('spotify.com') ||
    lowerUrl.includes('music.apple.com')) {
    return 'audio';
  }
  return 'video';
};

function App() {
  // Step: 'search' | 'confirm' | 'downloading' | 'result'
  const [step, setStep] = useState('search');
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [quality, setQuality] = useState('320'); // Default: Ultra MP3
  const [subtitle, setSubtitle] = useState('none');
  const [mode, setMode] = useState('audio'); // 'audio' | 'video'
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null); // 'success', 'error'
  const [message, setMessage] = useState('');

  // Advanced Settings
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [videoCodec, setVideoCodec] = useState('auto');
  const [compressVideo, setCompressVideo] = useState(false);
  const [trimEnabled, setTrimEnabled] = useState(false);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [spatialAudio, setSpatialAudio] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState(null);

  // Auto-detect mode when URL changes
  useEffect(() => {
    if (url) {
      const detected = detectMode(url);
      setMode(detected);
    }
  }, [url]);

  // Aviso específico para Instagram (separado para garantir que addToast já esteja definido)
  useEffect(() => {
    if (url && url.toLowerCase().includes('instagram.com')) {
      addToast('Links do Instagram podem exigir autenticacao (Cookies) nas Configuracoes para funcionar.', 'warning');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Wallpaper & Theme Manager
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('app_wallpaper'));
  const [blurLevel, setBlurLevel] = useState(() => localStorage.getItem('app_blur_level') || 'md');

  // Resolve wallpaper URL: relative paths need the apiUrl prefix
  const resolvedWallpaper = React.useMemo(() => {
    if (!wallpaper) return '';
    if (wallpaper.startsWith('/')) {
      const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;
      return baseUrl + wallpaper;
    }
    return wallpaper;
  }, [wallpaper]);

  useEffect(() => {
    if (resolvedWallpaper) {
      if (resolvedWallpaper.match(/\.(mp4|webm|ogg)/i) || resolvedWallpaper.includes('upload_wallpaper') || resolvedWallpaper.includes('custom_wallpaper')) {
        const video = document.createElement('video');
        video.crossOrigin = "Anonymous";
        video.src = resolvedWallpaper;
        video.muted = true;
        video.playsInline = true;
        
        video.onloadeddata = () => {
          video.currentTime = Math.min(1, video.duration / 2 || 0);
        };
        
        video.onseeked = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const img = new Image();
            img.onload = () => {
              applyThemeFromImage(img);
            };
            img.src = canvas.toDataURL('image/jpeg', 0.8);
          } catch (e) {
            console.error("Erro ao extrair cor do vídeo:", e);
          }
        };
      } else {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          applyThemeFromImage(img);
        };
        img.src = resolvedWallpaper;
      }
    } else {
      resetTheme();
    }
  }, [resolvedWallpaper]);

  // Advanced Toasts
  const [toasts, setToasts] = useState([]);

  const addToast = (title, type = 'info', action = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, title, type, action }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  const openDownloadsFolder = async () => {
    try {
      await axios.post(getApiUrl('/open_folder'));
    } catch (e) { console.error(e); }
  };


  // Audio Features
  const [pitch, setPitch] = useState(0); // -12 to +12

  // Language state – changing this triggers full re-render so translations update
  const [, setLang] = useState(getLanguage());

  const handleLanguageChange = (code) => {
    setLanguage(code);
    setLang(code);
  };

  // Auth & Settings
  const [showSettings, setShowSettings] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [organizeByArtist, setOrganizeByArtist] = useState(() => {
    const saved = localStorage.getItem('organizeByArtist');
    return saved === 'true';
  });
  const [organizeByPlaylist, setOrganizeByPlaylist] = useState(() => {
    const saved = localStorage.getItem('organizeByPlaylist');
    return saved === 'true';
  });
  const [sponsorblockEnabled, setSponsorblockEnabled] = useState(() => {
    const saved = localStorage.getItem('sponsorblockEnabled');
    return saved === 'true';
  });

  const [showLibrary, setShowLibrary] = useState(false);
  const [tagEditorSong, setTagEditorSong] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showConverter, setShowConverter] = useState(false);
  const [showStudioModal, setShowStudioModal] = useState(false);
  const [showShazamModal, setShowShazamModal] = useState(false);
  const [showMobileSync, setShowMobileSync] = useState(false);
  const [showSubscriptionsModal, setShowSubscriptionsModal] = useState(false);
  // Playlist Manager
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [playlistLoading, setPlaylistLoading] = useState(false);

  // Integrated Search
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Queue System (Batch Download)
  const [queue, setQueue] = useState([]);
  const [showQueue, setShowQueue] = useState(false);
  const [isProcessingQueue, setIsProcessingQueue] = useState(false);

  // Queue Resume / Memory System
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [savedQueueData, setSavedQueueData] = useState([]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('saved_queue');
      if (saved) {
        const parsed = JSON.parse(saved);
        const pendingItems = parsed.filter(item => item.status !== 'completed' && item.status !== 'error');
        if (pendingItems.length > 0) {
          setSavedQueueData(parsed);
          setShowResumePrompt(true);
        } else {
          localStorage.removeItem('saved_queue');
        }
      }
    } catch (e) {
      console.error("Failed to load saved queue", e);
    }
  }, []);

  // Ctrl+V / Cmd+V: Auto-paste URL from clipboard into the search bar
  useEffect(() => {
    const handlePaste = async () => {
      const active = document.activeElement;
      const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (isTyping) return; // Don't interfere when user is typing in a field
      try {
        const text = await navigator.clipboard.readText();
        if (!text) return;
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        if (isUrl) {
          setUrl(text.trim());
          setStep('search');
          // auto-detect mode
          const detected = detectMode(text);
          if (detected === 'audio') setMode('audio');
          addToast('🔗 URL colada automaticamente!', 'success');
        }
      } catch {
        // Clipboard permission denied — fail silently
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  useEffect(() => {
    if (showResumePrompt) return;
    if (queue.length > 0) {
      localStorage.setItem('saved_queue', JSON.stringify(queue));
    } else {
      localStorage.removeItem('saved_queue');
    }
  }, [queue, showResumePrompt]);

  // Auto-start Queue Processor
  React.useEffect(() => {
    if (showResumePrompt) return;
    if (queue.length > 0 && !isProcessingQueue) setIsProcessingQueue(true);
  }, [queue.length, isProcessingQueue, showResumePrompt]);

  const [searchLimit, setSearchLimit] = useState(30);
  const [playlistLimit, setPlaylistLimit] = useState(50);

  // Presets & Speed
  const [speed, setSpeed] = useState(1.0);
  const [presets, setPresets] = useState({ defaults: [], custom: [] });
  const [selectedPresetVal, setSelectedPresetVal] = useState(''); // nome do preset selecionado

  // Player
  const [currentSong, setCurrentSong] = useState(null);
  const [currentPlaylist, setCurrentPlaylist] = useState([]);
  const [isShuffle, setIsShuffle] = useState(false);

  const handleNextTrack = () => {
    if (!currentPlaylist || currentPlaylist.length === 0 || !currentSong) return;
    
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * currentPlaylist.length);
      const nextSong = currentPlaylist[randomIndex];
      setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local" });
      return;
    }

    const currentIndex = currentPlaylist.findIndex(s => s.file_path === currentSong.file);
    if (currentIndex !== -1 && currentIndex + 1 < currentPlaylist.length) {
      const nextSong = currentPlaylist[currentIndex + 1];
      setCurrentSong({ title: nextSong.title, file: nextSong.file_path, quality: "Local" });
    }
  };

  const handlePrevTrack = () => {
    if (!currentPlaylist || currentPlaylist.length === 0 || !currentSong) return;
    
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * currentPlaylist.length);
      const prevSong = currentPlaylist[randomIndex];
      setCurrentSong({ title: prevSong.title, file: prevSong.file_path, quality: "Local" });
      return;
    }

    const currentIndex = currentPlaylist.findIndex(s => s.file_path === currentSong.file);
    if (currentIndex > 0) {
      const prevSong = currentPlaylist[currentIndex - 1];
      setCurrentSong({ title: prevSong.title, file: prevSong.file_path, quality: "Local" });
    }
  };

  // Terms of Use
  const [showTerms, setShowTerms] = useState(false);
  const [showSpotifyModal, setShowSpotifyModal] = useState(false);
  const [spotifyInputUrl, setSpotifyInputUrl] = useState('');
  const [termsContent, setTermsContent] = useState('');
  const [termsLoading, setTermsLoading] = useState(true);

  // ===== API CONFIG =====
  // Single Port 8000 (Backend handles concurrency via Task Queue)
  const API_URL = `${window.location.protocol}//${window.location.hostname}:8000`;
  const getApiUrl = React.useCallback((endpoint = '') => `${API_URL}${endpoint}`, [API_URL]);

  // Update Checker
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateData, setUpdateData] = useState(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const checkForUpdates = async (manual = false) => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      const res = await axios.get(getApiUrl('/check_update'));
      if (res.data && res.data.update_available) {
        setUpdateData(res.data);
        setShowUpdateModal(true);
      } else if (manual) {
        alert("Você já está usando a versão mais recente!");
      }
    } catch {
      if (manual) alert("Erro ao checar atualizações.");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    checkForUpdates(false);
  }, []);

  // GLOBAL DOWNLOADS STATE (WebSocket Strategy)
  const [globalJobs, setGlobalJobs] = useState({});
  const [currentJobId, setCurrentJobId] = useState(null);
  const [nextDownloadInput, setNextDownloadInput] = useState('');
  const [consecutiveDownloads, setConsecutiveDownloads] = useState([]);
  const consecutiveDownloadsRef = React.useRef([]);
  const frozenDownloadOptionsRef = React.useRef(null);

  const replaceConsecutiveDownloads = (updater) => {
    const previous = consecutiveDownloadsRef.current;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    consecutiveDownloadsRef.current = next;
    setConsecutiveDownloads(next);
  };

  const submitConsecutiveDownload = async (downloadUrl) => {
    const options = frozenDownloadOptionsRef.current;
    if (!options) throw new Error('Configuração inicial do download não encontrada.');
    const response = await axios.post(getApiUrl('/download'), { ...options, url: downloadUrl });
    setProgress({ percent: 0, status: 'queued' });
    setCurrentJobId(response.data.job_id);
  };

  const addConsecutiveDownload = () => {
    const nextUrl = nextDownloadInput.trim();
    if (!/^https?:\/\/[^\s]+$/i.test(nextUrl)) {
      addToast('Cole um link válido para adicionar ao próximo download.', 'error');
      return;
    }
    replaceConsecutiveDownloads(previous => [...previous, { id: `${Date.now()}-${Math.random()}`, url: nextUrl }]);
    setNextDownloadInput('');
    addToast('Link adicionado em “A seguir”.', 'success');
  };

  const startNextConsecutiveDownload = (finishedWithError = false) => {
    const [next, ...remaining] = consecutiveDownloadsRef.current;
    if (!next) return false;
    replaceConsecutiveDownloads(remaining);
    setCurrentJobId(null);
    if (finishedWithError) addToast('O download falhou; iniciando o próximo link.', 'warning');
    else addToast('Download concluído; iniciando o próximo link.', 'success');
    submitConsecutiveDownload(next.url).catch(error => {
      addToast(error.response?.data?.detail || 'Falha ao iniciar o próximo download.', 'error');
      startNextConsecutiveDownload(true);
    });
    return true;
  };

  useEffect(() => {
    let ws;
    let reconnectTimer;
    const connectWs = () => {
      ws = new WebSocket(getApiUrl('/ws').replace('http', 'ws'));
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PLAY_EXTERNAL') {
            const fileName = data.file_path.split(/[/\\]/).pop();
            const externalSong = {
              title: fileName,
              author: "Local",
              file: data.file_path,
              quality: "Local",
              status: "completed",
              uniqueId: `local-${Date.now()}`
            };
            setQueue(prev => [externalSong, ...prev]);
            setCurrentSong(externalSong);
            return;
          }
          if (data.type === 'voice_command') {
            window.dispatchEvent(new CustomEvent('voiceCommand', { detail: data.action }));
            return;
          }
          setGlobalJobs(data);
        } catch {
          // Ignore malformed WebSocket messages.
        }
      };
      ws.onclose = () => {
        reconnectTimer = setTimeout(connectWs, 3000);
      };
    };
    connectWs();
    return () => {
      clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  // Sync single download with globalJobs
  useEffect(() => {
    if (step === 'downloading' && currentJobId) {
      const job = globalJobs[currentJobId];
      if (job) {
        if (job.progress !== undefined) {
          setProgress({ 
            percent: job.progress, 
            status: job.status,
            speed: job.speed_str,
            downloaded: job.downloaded_bytes_str,
            total: job.total_bytes_str
          });
        }
        if (job.status === 'done') {
          if (startNextConsecutiveDownload(false)) return;
          setDownloadInfo({
            status: 'success',
            title: job.title || job.filename,
            quality: quality,
            file: job.filename
          });
          addToast(t('statusDone') || 'Download concluído!', 'success', { label: t('openFolder'), onClick: openDownloadsFolder });
          setStep('result');
          setCurrentJobId(null);
        } else if (job.status === 'error' || job.status === 'timeout') {
          if (startNextConsecutiveDownload(true)) return;
          addToast(t('statusError') || 'Falha no download.', 'error');
          let errMsg = job.error || t('statusError');
          if (!isAuthenticated) {
            errMsg += "\n\n⚠️ Dica: Você está sem login (cookies.txt). Vá nas configurações, adicione seus cookies e tente novamente! O YouTube bloqueia downloads sem login.";
          }
          setMessage(errMsg);
          setStatus('error');
          setStep('confirm');
          setCurrentJobId(null);
        }
      }
    }
  }, [globalJobs, step, currentJobId]);



  React.useEffect(() => {
    checkAuth();
    checkTermsStatus();
  }, []);

  const checkTermsStatus = async () => {
    try {
      const res = await axios.get(getApiUrl('/terms/status'));
      if (!res.data.accepted) {
        const contentRes = await axios.get(getApiUrl('/terms/content'));
        setTermsContent(contentRes.data.content);
        setShowTerms(true);
      }
    } catch (e) {
      console.error("Terms check failed", e);
    } finally {
      setTermsLoading(false);
    }
  };

  const handleAcceptTerms = async () => {
    try {
      await axios.post(getApiUrl('/terms/accept'));
      setShowTerms(false);
      addToast('Termos aceitos. Bem-vindo!', 'success');
    } catch (e) {
      console.error(e);
      addToast('Erro ao aceitar termos.', 'error');
    }
  };

  const checkAuth = async () => {
    try {
      const res = await axios.get(getApiUrl('/auth_status'));
      setIsAuthenticated(res.data.authenticated);
    } catch (e) {
      console.error("Auth check failed", e);
    }
  };

  // Carregar Presets ao iniciar
  React.useEffect(() => {
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const res = await axios.get(getApiUrl('/presets'));
      setPresets(res.data);
    } catch (e) { console.error("Falha ao carregar presets", e); }
  };

  const applyPreset = (presetName) => {
    setSelectedPresetVal(presetName);
    if (!presetName) return;

    // Buscar nos defaults e custom
    const all = [...presets.defaults, ...presets.custom];
    const p = all.find(x => x.name === presetName);

    if (p) {
      setPitch(p.pitch);
      setSpeed(p.speed);
    }
  };

  const handleSavePreset = async () => {
    const name = prompt("Nome para salvar este preset:");
    if (!name) return;

    try {
      await axios.post(getApiUrl('/presets'), {
        name,
        pitch,
        speed,
        eq: 'normal'
      });
      alert('Preset salvo!');
      fetchPresets();
    } catch (e) {
      alert('Erro ao salvar: ' + (e.response?.data?.detail || e.message));
    }
  };

  // ===== PLAYLIST MANAGER FUNCTIONS =====

  const fetchPlaylistDetails = async () => {
    if (!metadata?.is_playlist) return;

    setPlaylistLoading(true);
    console.log('🔍 Buscando detalhes da playlist...', url);

    try {
      const res = await axios.post(getApiUrl('/playlist/details'), {
        url,
        limit: playlistLimit
      }, {
        timeout: 60000 // 60 segundos
      });

      console.log('✅ Playlist carregada:', res.data);
      setPlaylistVideos(res.data.videos);
      setShowPlaylistModal(true);

      // Selecionar apenas os PENDENTES por padrão
      const pendingIndices = new Set(
        res.data.videos
          .filter(v => v.status !== 'downloaded')
          .map(v => v.index)
      );
      setSelectedVideos(pendingIndices);

    } catch (error) {
      console.error('❌ Erro ao buscar playlist:', error);
      const errorMsg = error.response?.data?.detail || error.message || 'Erro ao carregar playlist';
      setMessage(errorMsg);
      setStatus('error');
    } finally {
      setPlaylistLoading(false);
    }
  };

  const toggleVideoSelection = (index) => {
    // Safety check
    const video = playlistVideos.find(v => v.index === index);
    if (video && video.status === 'downloaded') return;

    const newSelected = new Set(selectedVideos);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedVideos(newSelected);
  };

  const deselectAllVideos = () => {
    setSelectedVideos(new Set());
  };

  const downloadSelectedVideos = () => {

    if (selectedVideos.size === 0) {
      alert('Selecione pelo menos um vídeo');
      return;
    }

    // --- COOKIE ENFORCEMENT ---
    if (!isAuthenticated) {
      const confirmUpload = window.confirm(
        `⚠️ ATENÇÃO: Você está tentando baixar da playlist sem login (sem cookies.txt).\n\n` +
        `Isso tem uma alta chance de resultar em erros no download ou banimento/bloqueio temporário do seu IP pelo YouTube.\n\n` +
        `Clique em OK para enviar seus cookies agora (Recomendado), ou CANCELAR para prosseguir por sua conta e risco.`
      );

      if (confirmUpload) {
        setShowSettings(true);
        return;
      }
    }
    // ---------------------------


    // Filtrar vídeos selecionados
    const videosToAdd = playlistVideos.filter(v => selectedVideos.has(v.index));

    console.log(`📥 Adicionando ${videosToAdd.length} vídeos à fila...`);

    // Criar itens da fila
    const queueItems = videosToAdd.map((video, idx) => ({
      id: video.id,
      title: video.title,
      thumbnail: video.thumbnail,
      uploader: video.uploader,
      duration_string: video.duration_string,
      url: video.url,
      uniqueId: Date.now() + Math.random() + idx,
      pitch: mode === 'audio' ? pitch : 0,
      speed: mode === 'audio' ? speed : 1.0,
      subtitle: mode === 'video' ? subtitle : 'none',
      playlist_id: video.playlistIdRef, // Pass ref from backend
      status: 'pending',
      progress: 0,
      addedAt: Date.now()
    }));

    // Adicionar à fila e abrir Drawer
    setQueue(prev => [...prev, ...queueItems]);
    setShowPlaylistModal(false);
    setShowQueue(true);

    setShowQueue(true);

    addToast(`${queueItems.length} vídeos adicionados à fila!`, 'success');

    // Tentar iniciar automaticamente após render
    setTimeout(() => {
      const startBtn = document.getElementById('start-downloads-btn');
      if (startBtn) startBtn.click();
    }, 500);
  };

  // ===== REDOWNLOAD LOGIC =====
  const executeRetry = async (video, playlistId) => {
    try {
      if (!playlistId) {
        addToast('Playlist ID desconhecido.', 'error');
        return;
      }
      addToast(`Reiniciando download: ${video.title}`, 'info');
      await axios.post(getApiUrl('/download/retry'), {
        playlist_id: playlistId,
        video_id: video.id
      });

      // Optimistic update
      setPlaylistVideos(prev => prev.map(v =>
        v.id === video.id ? { ...v, status: 'pending' } : v
      ));

      // Select it
      toggleVideoSelection(video.index);

    } catch (e) {
      console.error(e);
      addToast('Erro ao rebaixar.', 'error');
    }
  };



  // Reset quality when mode changes
  React.useEffect(() => {
    if (mode === 'audio') {
      setQuality('320');
    } else {
      // Default to highest available if metadata exists
      if (metadata?.resolutions?.length > 0) {
        setQuality(`${metadata.resolutions[0]}p`);
      } else {
        setQuality('720p');
      }
    }
  }, [mode, metadata]);

  // ===== QUEUE LOGIC =====
  const addToQueue = (video) => {
    const newItem = {
      ...video,
      uniqueId: Date.now() + Math.random(),
      pitch: mode === 'audio' ? pitch : 0,
      speed: mode === 'audio' ? speed : 1.0,
      status: 'pending',
      progress: 0,
      addedAt: Date.now()
    };
    setQueue(prev => [...prev, newItem]);
    addToast('Adicionado à fila!', 'success');
    setTimeout(() => setStatus(null), 1500);
  };

  const removeFromQueue = async (uniqueId) => {
    const item = queue.find(i => i.uniqueId === uniqueId);
    if (item && item.jobId) {
      try {
        await axios.post(getApiUrl(`/download/cancel/${item.jobId}`));
      } catch (e) { console.error("Cancel error:", e); }
    }
    setQueue(prev => prev.filter(i => i.uniqueId !== uniqueId));
  };

  const updateQueueItem = (uniqueId, updates) => {
    setQueue(prev => prev.map(item =>
      item.uniqueId === uniqueId ? { ...item, ...updates } : item
    ));
  };

  // ===== QUEUE LOGIC (PARALLEL) =====
  const CONCURRENCY_LIMIT = 8;

  const processQueue = () => {
    setIsProcessingQueue(true);
    setShowQueue(true);
  };

  // Queue Monitor Effect
  React.useEffect(() => {
    if (!isProcessingQueue) return;

    // We use a functional update approach to avoid stale closures if possible, due to async nature
    // But effect relies on 'queue'.

    const downloading = queue.filter(i => i.status === 'downloading');
    const pending = queue.filter(i => i.status === 'pending');

    // Calculate slots
    const slotsFree = CONCURRENCY_LIMIT - downloading.length;

    if (slotsFree > 0 && pending.length > 0) {
      console.log(`🚀 Starting batch of ${slotsFree} downloads...`);
      const toStart = pending.slice(0, slotsFree);

      // Optimistic Update: Mark them ALL as downloading immediately
      const idsToStart = new Set(toStart.map(i => i.uniqueId));

      setQueue(prev => prev.map(item =>
        idsToStart.has(item.uniqueId)
          ? { ...item, status: 'queued', progress: 0 }
          : item
      ));

      // Trigger requests
      toStart.forEach(item => performDownload(item));
    }
  }, [queue, isProcessingQueue]);


  const performDownload = async (item) => {
    try {
      const downloadUrl = item.url || `https://www.youtube.com/watch?v=${item.id}`;

      // 1. Enqueue Task
      const startRes = await axios.post(getApiUrl('/download/enqueue'), {
        url: downloadUrl,
        quality: quality,
        mode: mode,
        pitch: item.pitch !== undefined ? item.pitch : pitch,
        speed: item.speed !== undefined ? item.speed : speed,
        subtitle: item.subtitle !== undefined ? item.subtitle : (mode === 'video' ? subtitle : 'none'),
        organize: organizeByArtist,
        organize_by_playlist: organizeByPlaylist,
        sponsorblock_enabled: sponsorblockEnabled,
        title: item.title,
        artist: item.uploader,
        cover_path: item.thumbnail,
        playlist_id: item.playlist_id, // For DB persistence
        video_id: item.id,             // For DB persistence
        start_time: trimEnabled && startTime ? startTime : null,
        end_time: trimEnabled && endTime ? endTime : null,
        spatial_audio: spatialAudio
      });

      const { job_id } = startRes.data;
      console.log(`🚀 Queued Job ID: ${job_id}`);

      // 2. Assign Job ID (WebSocket will take over)
      updateQueueItem(item.uniqueId, {
        jobId: job_id,
        status: 'queued',
        progress: 0
      });

    } catch (e) {
      console.error("Enqueue Error:", e);
      updateQueueItem(item.uniqueId, { status: 'error', error: 'Falha ao enfileirar' });
    }
  };



  // ===== SEARCH FUNCTIONS =====
  const handleSearch = async (queryInput) => {
    if (!queryInput) return;

    setIsSearching(true);
    setSearchResults([]); // Limpar anteriores
    console.log('🔍 Pesquisando:', queryInput);

    try {
      const res = await axios.post(getApiUrl('/search'), {
        query: queryInput,
        limit: searchLimit
      });

      console.log('✅ Resultados:', res.data.results);
      setSearchResults(res.data.results);

      if (res.data.results.length === 0) {
        setMessage('Nenhum vídeo encontrado.');
        setStatus('error');
      }
    } catch (error) {
      console.error('❌ Erro na busca:', error);
      addToast(error.response?.data?.detail || 'Erro ao buscar vídeos.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectVideo = (videoUrl) => {
    console.log("👉 Video Selected from UI:", videoUrl);
    if (!videoUrl) {
      console.error("❌ Selected blank video URL!");
      return;
    }
    setUrl(videoUrl);
    setSearchResults([]);
    loadVideoDetails(videoUrl);
  };

  const loadVideoDetails = async (videoUrl) => {
    setLoading(true);
    setMetadata(null); // Force clear previous data
    setMessage('');
    console.log("📥 Loading Info for:", videoUrl);
    try {
      const response = await axios.post(getApiUrl('/info'), { url: videoUrl });
      setMetadata(response.data);
      setStep('confirm');
    } catch (error) {
      console.error(error);
      setStatus('error');
      const errorMsg = error.response?.data?.detail || 'Erro ao carregar vídeo.';
      setMessage(errorMsg);
      setTimeout(() => setStatus(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const fetchInfo = async (e) => {
    e?.preventDefault();
    if (!url) return;

    // Detectar links de Spotify/Apple Music/SoundCloud e redirecionar para o fluxo de importação
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('spotify.com') || lowerUrl.includes('music.apple.com') || lowerUrl.includes('soundcloud.com')) {
      setSpotifyInputUrl(url);
      setShowSpotifyModal(true);
      return;
    }

    // Detectar Busca vs URL (Suporte Universal: Twitch, Kick, etc.)
    const isUrl = /^(http|https):\/\/[^ "]+$/i.test(url);

    if (!isUrl) {
      handleSearch(url);
      return;
    }

    // Se for URL, fluxo normal
    loadVideoDetails(url);
  };

  const handleDownload = async () => {
    // --- COOKIE ENFORCEMENT ---
    if (!isAuthenticated) {
      const confirmUpload = window.confirm(
        `⚠️ ATENÇÃO: Você está tentando baixar sem login (sem cookies.txt).\n\n` +
        `Isso tem uma alta chance de resultar em erros no download ou banimento/bloqueio temporário do seu IP pelo YouTube.\n\n` +
        `Clique em OK para enviar seus cookies agora (Recomendado), ou CANCELAR para prosseguir por sua conta e risco.`
      );

      if (confirmUpload) {
        setShowSettings(true);
        return;
      }
    }
    // ---------------------------

    setStep('downloading');
    setStatus(null);
    setMessage('');
    frozenDownloadOptionsRef.current = {
      quality,
      mode,
      subtitle: mode === 'video' ? subtitle : 'none',
      playlist: false,
      pitch: mode === 'audio' ? pitch : 0,
      speed: mode === 'audio' ? speed : 1.0,
      start_time: trimEnabled && startTime ? startTime : null,
      end_time: trimEnabled && endTime ? endTime : null,
      spatial_audio: spatialAudio,
      video_codec: videoCodec,
      compress_video: compressVideo,
      organize: organizeByArtist,
      organize_by_playlist: organizeByPlaylist,
      sponsorblock_enabled: sponsorblockEnabled
    };

    try {
      // 1. Enqueue Task (agora /download também retorna job_id imediatamente)
      const response = await axios.post(getApiUrl('/download'), {
        ...frozenDownloadOptionsRef.current,
        url: metadata.url
      });

      const { job_id } = response.data;
      console.log(`🚀 Queued Job ID via Legacy Endpoint: ${job_id}`);

      setCurrentJobId(job_id);

    } catch (error) {
      console.error(error);
      addToast('Falha ao iniciar download.', 'error');
      setStep('confirm');
    }
  };

  

  const [progress, setProgress] = useState({ percent: 0, status: 'idle' });

  // ... (reset function needs to clear progress too)
  const reset = () => {
    setStep('search');
    setUrl('');
    setMetadata(null);
    setStatus(null);
    setMessage('');
    setProgress({ percent: 0, status: 'idle' }); // Reset
    setMode('audio');
  };

  return (
    <>
      <BackgroundMedia 
        wallpaper={wallpaper} 
        resolvedWallpaper={resolvedWallpaper} 
        blurLevel={blurLevel} 
      />

      <div className={`min-h-screen bg-background/50 text-white flex flex-col items-center justify-center p-4 font-sans selection:bg-primary selection:text-white relative ${currentSong ? 'pb-28' : ''}`}>
      <TermsModal
        showTerms={showTerms}
        termsLoading={termsLoading}
        termsContent={termsContent}
        handleAcceptTerms={handleAcceptTerms}
      />

      <TopAppBar
        setShowConverter={setShowConverter}
        setShowStudioModal={setShowStudioModal}
        setShowShazamModal={setShowShazamModal}
        setShowLibrary={setShowLibrary}
        setShowHistory={setShowHistory}
        checkForUpdates={checkForUpdates}
        isCheckingUpdate={isCheckingUpdate}
        setShowMobileSync={setShowMobileSync}
        setShowSubscriptionsModal={setShowSubscriptionsModal}
        setShowDonate={setShowDonate}
        setShowSettings={setShowSettings}
        isAuthenticated={isAuthenticated}
      />

      {/* Queue Resume Modal */}
      <AnimatePresence>
        {showResumePrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative text-center space-y-6"
            >
              <div className="mx-auto w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mb-4">
                <List className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">{t('resumeTitle')}</h2>
              <p className="text-secondary text-sm">
                {t('resumeDesc', savedQueueData.filter(i => i.status !== 'completed' && i.status !== 'error').length)}
              </p>
              
              <div className="flex gap-4 w-full">
                <RippleButton
                  onClick={() => {
                    localStorage.removeItem('saved_queue');
                    setShowResumePrompt(false);
                  }}
                  className="flex-1 py-3 px-4 rounded-full font-medium text-on-surface-variant border border-outline-variant hover:bg-surface-variant transition-colors"
                >
                  {t('resumeNo')}
                </RippleButton>
                <RippleButton
                  onClick={() => {
                    const queueToRestore = savedQueueData.map(item => {
                      if (item.status !== 'completed' && item.status !== 'error') {
                        return { ...item, status: 'pending', progress: 0, jobId: null };
                      }
                      return item;
                    });
                    setQueue(queueToRestore);
                    setShowResumePrompt(false);
                    setShowQueue(true);
                  }}
                  className="flex-1 py-3 px-4 rounded-full font-medium text-on-primary bg-primary hover:bg-primary/90 transition-colors shadow-md"
                >
                  {t('resumeYes')}
                </RippleButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        isAuthenticated={isAuthenticated}
        organizeByArtist={organizeByArtist}
        setOrganizeByArtist={setOrganizeByArtist}
        organizeByPlaylist={organizeByPlaylist}
        setOrganizeByPlaylist={setOrganizeByPlaylist}
        sponsorblockEnabled={sponsorblockEnabled}
        setSponsorblockEnabled={setSponsorblockEnabled}
        apiUrl={API_URL}
        onLanguageChange={handleLanguageChange}
        onUploadSuccess={() => {
          checkAuth();
          alert("Cookies atualizados com sucesso!");
          setShowSettings(false);
        }}
        wallpaper={wallpaper}
        setWallpaper={setWallpaper}
        blurLevel={blurLevel}
        setBlurLevel={setBlurLevel}
      />

      <AnimatePresence>
        <UpdateModal 
          isOpen={showUpdateModal} 
          onClose={() => setShowUpdateModal(false)} 
          updateData={updateData} 
        />
        <StudioModal
          isOpen={showStudioModal}
          onClose={() => setShowStudioModal(false)}
          apiUrl={API_URL}
        />
        <ShazamModal
          isOpen={showShazamModal}
          onClose={() => setShowShazamModal(false)}
          apiUrl={API_URL}
        />
      </AnimatePresence>

      {/* Donation Modal */}
      <AnimatePresence>
        {showDonate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowDonate(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-surface-container border border-outline-variant/30 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setShowDonate(false)}
                className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-pink-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-pink-400" />
                </div>

                <h3 className="text-2xl font-bold bg-gradient-to-r from-pink-400 to-purple-400 bg-clip-text text-transparent">
                  {t('donateTitle')}
                </h3>

                <p className="text-on-surface-variant text-sm">
                  {t('donateDesc')}
                </p>

                <div className="bg-surface-container-highest p-4 rounded-xl inline-block mx-auto">
                  <img src={qrcodeImg} alt="QR Code Pix" className="w-48 h-48 object-contain" />
                </div>

                <div className="bg-surface-container-low p-3 rounded-xl flex items-center justify-center gap-2 border border-outline-variant/30 relative group">
                  {/* Hidden Text for reference but removed from UI */}
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText("00020126580014br.gov.bcb.pix0136bd1b2d5e-e160-4f50-b3a8-1f75fe2c721c5204000053039865802BR5925ANDREY WARLLEY DUARTE DA 6015SANTA ISABEL DO62070503***6304D541");
                      addToast(t('donatePixCopied'), "success");
                    }}
                    className="w-full py-3 bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium border border-pink-500/30"
                    title="Copiar Código"
                  >
                    <Copy className="w-5 h-5" />
                    <span>{t('donateCopyPix')}</span>
                  </button>
                </div>

                <div className="pt-4 border-t border-outline-variant/30 mt-4">
                  <a
                    href="https://github.com/Echiiiro453"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 text-on-surface-variant hover:text-on-surface transition-colors"
                  >
                    <Github className="w-5 h-5" />
                    <span>github.com/Echiiiro453</span>
                  </a>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main App Container */}
      <div className="z-10 w-full max-w-xl space-y-8 mt-10">

        {/* Header */}
        <motion.div
          layout
          className="text-center space-y-2"
        >
          <div className="inline-flex items-center justify-center p-3 rounded-full bg-white/5 mb-4 backdrop-blur-md">
            <Music className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-medium tracking-tight text-white">
            {t('mainTitle')}
          </h1>
          <p className="text-secondary text-lg">
            {step === 'search' ? t('mainSubtitleSearch') : t('mainSubtitleConfig')}
          </p>
        </motion.div>

        <AnimatePresence mode="wait">

          {/* STEP 1: BUSCA */}
          {step === 'search' && (
            <motion.form
              key="search-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={fetchInfo}
              className="relative group space-y-4"
            >
              <div className="relative">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                  <Search className="w-5 h-5 text-on-surface-variant group-focus-within:text-primary transition-colors" />
                </div>
                <input
                  type="text"
                  placeholder={t('searchPlaceholderText')}
                  className="w-full h-14 pl-12 pr-12 bg-surface-container-high border border-outline-variant/30 rounded-full focus:outline-none focus:border-primary transition-all text-lg placeholder:text-on-surface-variant text-on-surface shadow-md"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setUrl(text);
                    } catch (err) {
                      console.error("Failed to read clipboard:", err);
                    }
                  }}
                  className="absolute inset-y-0 right-4 flex items-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                  title="Colar da Área de Transferência"
                >
                  <ClipboardPaste className="w-5 h-5" />
                </button>

                {/* Progresso visual imediato */}
                {(loading || isSearching) && (
                  <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-surface-container-highest overflow-hidden rounded-full">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="w-1/3 h-full bg-primary"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-1 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSearch(url)}
                    disabled={loading || !url}
                    className={`flex-1 h-12 rounded-full font-medium transition-all flex items-center justify-center gap-2 ${!/^(http|https):\/\/[^ "]+$/i.test(url)
                      ? 'bg-primary text-on-primary hover:scale-[1.02] shadow-md shadow-primary/20'
                      : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                  >
                    <Search size={18} />
                    <span>{t('btnSearch')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => fetchInfo(e)}
                    disabled={loading || !url}
                    className={`flex-1 h-12 rounded-full font-medium transition-all flex items-center justify-center gap-2 ${/^(http|https):\/\/[^ "]+$/i.test(url)
                      ? 'bg-primary text-on-primary hover:scale-[1.02] shadow-md shadow-primary/20'
                      : 'bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                      }`}
                  >
                    <ArrowRight size={18} />
                    <span>{t('btnOpenLink')}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowSpotifyModal(true)}
                  className="sm:flex-none h-12 px-6 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface font-medium transition-all flex items-center justify-center gap-2 hover:scale-[1.02]"
                  title="Importar Playlist (Spotify/Apple/SoundCloud)"
                >
                  <Music size={18} />
                  <span className="hidden sm:inline">Importar Playlist</span>
                </button>
              </div>
            </motion.form>
          )}

          {/* SEARCH RESULTS */}
          {step === 'search' && (isSearching || searchResults.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full space-y-4"
            >
              {isSearching && (
                <div className="grid grid-cols-1 gap-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonCard key={i} />
                  ))}
                </div>
              )}

              {!isSearching && searchResults.length > 0 && (
                <>
                  <div className="flex items-center justify-between text-on-surface-variant px-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t('labelQty')}</span>
                      <select
                        value={searchLimit}
                        onChange={(e) => setSearchLimit(Number(e.target.value))}
                        className="bg-surface-container border border-outline-variant/30 rounded-lg px-2 py-0.5 text-xs text-on-surface focus:border-primary outline-none cursor-pointer hover:bg-surface-container-high"
                      >
                        <option value={10} className="bg-slate-800 text-white">10</option>
                        <option value={30} className="bg-slate-800 text-white">30</option>
                        <option value={50} className="bg-slate-800 text-white">50</option>
                        <option value={100} className="bg-slate-800 text-white">Max (100)</option>
                      </select>
                    </div>
                    <button
                      onClick={() => setSearchResults([])}
                      className="text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                      {t('btnClear')}
                    </button>
                  </div>

                  <div className="grid gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollfoo">
                    {searchResults.map((video) => (
                      <div
                        key={video.id}
                        onClick={() => handleSelectVideo(video.url)}
                        className="bg-surface-container-low hover:bg-surface-container-high border border-transparent hover:border-outline-variant/30 p-3 rounded-3xl flex gap-4 cursor-pointer transition-all duration-300 group hover:shadow-2xl"
                      >
                        <div className="relative w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-black/50">
                          <img
                            src={video.thumbnail || `https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            loading="lazy"
                          />
                          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium font-mono">
                            {video.duration_string || '0:00'}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <h3 className="text-on-surface font-medium line-clamp-2 leading-tight mb-1 group-hover:text-primary transition-colors text-[15px]">
                            {video.title}
                          </h3>
                          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                            <span className="font-medium truncate">{video.uploader}</span>
                            {video.view_count && (
                              <span className="opacity-60">• {(video.view_count / 1000).toFixed(0)}k views</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pr-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-2 group-hover:translate-x-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); addToQueue(video); }}
                            className="w-10 h-10 rounded-full bg-secondary-container hover:bg-primary text-on-secondary-container hover:text-on-primary flex items-center justify-center transition-all shadow-md"
                            title="Adicionar à fila"
                          >
                            <Plus size={18} />
                          </button>
                          <div className="w-10 h-10 rounded-full bg-surface-container-highest text-on-surface-variant flex items-center justify-center">
                            <ArrowRight size={18} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}



          {/* STEP 2: CONFIRMAÇÃO / RESULTADO */}
          {(step === 'confirm' || step === 'downloading' || step === 'result') && metadata && (
            <motion.div
              key="confirm-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-surface-container border border-outline-variant/30 rounded-4xl p-6 space-y-6 shadow-2xl"
            >
              {/* Media Info */}
              <div className="flex gap-4 items-center">
                {metadata.thumbnail ? (
                  <img src={metadata.thumbnail} alt="Cover" className="w-20 h-20 rounded-2xl object-cover shadow-lg" />
                ) : (
                  <div className="w-20 h-20 bg-surface-container-highest rounded-2xl flex items-center justify-center">
                    <Music className="w-8 h-8 text-on-surface-variant" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg leading-tight line-clamp-2 text-on-surface">{metadata.title}</h3>
                  <p className="text-on-surface-variant text-sm mt-1">{t('readyToDownload')}</p>
                </div>
              </div>

              {step === 'confirm' && (
                <div className="space-y-4">
                  {/* Playlist Manager Button */}
                  {metadata.is_playlist && (
                    <div className="mb-4 space-y-2">
                      <div className="bg-primary-container/20 border border-primary-container rounded-3xl p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary-container rounded-xl">
                            <FileText className="w-5 h-5 text-on-primary-container" />
                          </div>
                          <div>
                            <h4 className="font-bold text-on-surface">{t('playlistDetectedTitle')}</h4>
                            <p className="text-xs text-on-surface-variant">{t('playlistDetectedDesc')}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            fetch('/api/subscriptions/add', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                playlist_id: metadata.id,
                                url: metadata.webpage_url || metadata.url,
                                title: metadata.title,
                                platform: metadata.magic_source || 'YouTube'
                              })
                            })
                            .then(res => res.json())
                            .then(data => {
                              if (data.success) {
                                addToast('Inscricao confirmada! Playlist monitorada a cada 4 horas.', 'success');
                              } else {
                                addToast(data.message || 'Ja inscrito.', 'warning');
                              }
                            });
                          }}
                          className="p-2 bg-primary/10 hover:bg-primary text-primary hover:text-on-primary rounded-full transition-all flex-shrink-0"
                          title="Monitorar Playlist Automaticamente"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                        </button>
                      </div>

                      <button
                        onClick={fetchPlaylistDetails}
                        disabled={playlistLoading}
                        className="w-full py-3 bg-primary hover:bg-primary/90 disabled:bg-surface-container-highest disabled:text-on-surface-variant text-on-primary font-bold rounded-full transition-all flex items-center justify-center gap-2 shadow-lg"
                      >
                        {playlistLoading ? (
                          <>{t('btnLoadingPlaylist')}</>
                        ) : (
                          <>
                            <FileText size={20} />
                            {t('btnViewPlaylist')}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* Mode Toggle */}
                  <div className="flex bg-surface-container-highest p-1 rounded-full">
                    <button
                      onClick={() => setMode('audio')}
                      className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${mode === 'audio' ? 'bg-secondary-container text-on-secondary-container shadow-md' : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5'
                        }`}
                    >
                      {t('tabAudio')}
                    </button>
                    <button
                      onClick={() => setMode('video')}
                      className={`flex-1 py-2 rounded-full text-sm font-bold transition-all ${mode === 'video' ? 'bg-secondary-container text-on-secondary-container shadow-md' : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5'
                        }`}
                    >
                      {t('tabVideo')}
                    </button>
                  </div>

                  {/* Audio Features (Pitch & Speed) - Only for Audio */}
                  {mode === 'audio' && (
                    <div className="bg-surface-container-high border border-outline-variant/30 rounded-3xl p-4 space-y-4">

                      {/* Presets Dropdown */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-xs font-semibold text-secondary uppercase tracking-wider">{t('labelPresets')}</label>
                          <button onClick={handleSavePreset} className="text-xs text-primary hover:text-blue-300 flex items-center gap-1 transition-colors">
                            <Save size={12} /> {t('btnSavePreset')}
                          </button>
                        </div>
                        <select
                          value={selectedPresetVal}
                          onChange={(e) => applyPreset(e.target.value)}
                          className="w-full bg-surface-container-low border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm outline-none focus:border-primary cursor-pointer"
                        >
                          <option value="" className="bg-surface-container text-on-surface-variant">{t('selectPreset')}</option>
                          <optgroup label={t('groupDefaultPresets')} className="bg-surface-container text-on-surface">
                            {presets.defaults.map(p => (
                              <option key={p.name} value={p.name}>{p.name}</option>
                            ))}
                          </optgroup>
                          {presets.custom.length > 0 && (
                            <optgroup label={t('groupMyPresets')} className="bg-surface-container text-on-surface">
                              {presets.custom.length > 0 && presets.custom.map(p => (
                                <option key={p.name} value={p.name}>{p.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </div>

                      {/* Pitch Control */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-on-surface">{t('labelPitch')}</span>
                          </div>
                          <span className={`text-xs font-mono font-bold ${pitch === 0 ? 'text-secondary' : 'text-purple-400'}`}>
                            {pitch > 0 ? `+${pitch}` : pitch} semi
                          </span>
                        </div>
                        <input
                          type="range"
                          min="-12"
                          max="12"
                          step="1"
                          value={pitch}
                          onChange={(e) => { setPitch(parseInt(e.target.value)); setSelectedPresetVal(''); }}
                          className="w-full h-1.5 bg-on-surface/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                        />
                        <div className="flex justify-between text-[10px] text-secondary/50 font-mono px-1">
                          <span>-12</span>
                          <span>0</span>
                          <span>+12</span>
                        </div>
                      </div>

                      {/* Speed Control */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-on-surface">{t('speedControl')}</span>
                          </div>
                          <span className={`text-xs font-mono font-bold ${speed === 1.0 ? 'text-secondary' : 'text-blue-400'}`}>
                            {speed}x
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0.5"
                          max="2.0"
                          step="0.05"
                          value={speed}
                          onChange={(e) => { setSpeed(parseFloat(e.target.value)); setSelectedPresetVal(''); }}
                          className="w-full h-1.5 bg-on-surface/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] text-secondary/50 font-mono px-1">
                          <span>0.5x</span>
                          <span>1.0x</span>
                          <span>2.0x</span>
                        </div>
                      </div>

                    </div>
                  )}

                  {mode === 'video' && metadata.subtitles && metadata.subtitles.length > 0 && (
                    <div className="mb-4 p-4 bg-surface-container border border-outline-variant/30 rounded-2xl">
                      <label className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2 block">
                        Legendas
                      </label>
                      <select
                        value={subtitle}
                        onChange={(e) => setSubtitle(e.target.value)}
                        className="w-full bg-surface-container-highest border-none rounded-xl px-3 py-3 text-on-surface text-sm font-medium outline-none focus:ring-2 focus:ring-primary/50 cursor-pointer"
                      >
                        <option value="none">Sem legenda</option>
                        <option value="all">Todas as legendas</option>
                        {metadata.subtitles.map(sub => (
                          <option key={sub.code} value={sub.code}>{sub.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="relative">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs font-semibold text-secondary uppercase tracking-wider block">
                        Qualidade ({mode === 'audio' ? 'Áudio' : 'Vídeo'})
                      </label>
                      <button 
                        onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                        className={`p-1.5 rounded-full transition-colors ${showAdvancedSettings ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-container-highest'}`}
                        title="Configurações Avançadas"
                      >
                        <Settings size={16} />
                      </button>
                    </div>

                    {showAdvancedSettings && (
                      <div className="absolute z-10 w-full mt-1 bg-surface-container-high rounded-[24px] shadow-lg border border-outline-variant/30 p-4 mb-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-on-surface">Download Avançado</span>
                          <button onClick={() => setShowAdvancedSettings(false)} className="p-1 text-on-surface-variant rounded-full hover:bg-surface-container-highest">
                            <X size={16} />
                          </button>
                        </div>
                        
                        <div className="mb-4">
                          <label className="text-xs font-medium text-on-surface-variant mb-2 block">Codec de Vídeo</label>
                          <div className="flex bg-surface-container-highest rounded-full p-1 border border-outline-variant/20">
                            {['auto', 'h264', 'vp9', 'av1'].map(codec => (
                              <button
                                key={codec}
                                onClick={() => setVideoCodec(codec)}
                                className={`flex-1 py-1.5 px-2 text-xs font-bold rounded-full transition-all ${videoCodec === codec ? 'bg-secondary-container text-on-secondary-container shadow-sm' : 'text-on-surface-variant hover:bg-surface-variant'}`}
                              >
                                {codec.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-on-surface-variant mt-1 px-1">
                            {videoCodec === 'auto' && "Automático (Recomendado)"}
                            {videoCodec === 'h264' && "Alta compatibilidade (Telas antigas)"}
                            {videoCodec === 'vp9' && "Melhor qualidade (Padrão web atual)"}
                            {videoCodec === 'av1' && "Menor tamanho (Lento para processar)"}
                          </p>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20">
                          <div>
                            <span className="text-sm font-bold text-on-surface block">Compressão Otimizada</span>
                            <span className="text-[10px] text-on-surface-variant">Re-codifica para o menor tamanho possível via FFmpeg</span>
                          </div>
                          <button
                            onClick={() => setCompressVideo(!compressVideo)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compressVideo ? 'bg-primary' : 'bg-surface-variant'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${compressVideo ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20">
                          <div>
                            <span className="text-sm font-bold text-on-surface block flex items-center gap-1"><Scissors size={14} /> Recortar (Trim)</span>
                            <span className="text-[10px] text-on-surface-variant">Baixa o arquivo todo e corta localmente depois</span>
                          </div>
                          <button
                            onClick={() => setTrimEnabled(!trimEnabled)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${trimEnabled ? 'bg-primary' : 'bg-surface-variant'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${trimEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                          </button>
                        </div>

                        {mode === 'audio' && (
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant/20">
                            <div>
                              <span className="text-sm font-bold text-on-surface block flex items-center gap-1">🎧 Áudio Espacial (8D)</span>
                              <span className="text-[10px] text-on-surface-variant">Filtro Ambisonics Binaural e Reverb aplicado no FLAC/MP3 baixado</span>
                            </div>
                            <button
                              onClick={() => setSpatialAudio(!spatialAudio)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${spatialAudio ? 'bg-primary' : 'bg-surface-variant'}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${spatialAudio ? 'translate-x-4' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        )}
                        
                        <AnimatePresence>
                          {trimEnabled && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden mt-3 flex gap-2"
                            >
                              <div className="flex-1">
                                <label className="text-[10px] font-bold text-secondary uppercase px-1">Início (Opcional)</label>
                                <input 
                                  type="text" 
                                  placeholder="00:00" 
                                  value={startTime}
                                  onChange={(e) => setStartTime(e.target.value)}
                                  className="w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm focus:border-primary outline-none"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-[10px] font-bold text-secondary uppercase px-1">Fim (Opcional)</label>
                                <input 
                                  type="text" 
                                  placeholder="01:30" 
                                  value={endTime}
                                  onChange={(e) => setEndTime(e.target.value)}
                                  className="w-full mt-1 bg-surface-container border border-outline-variant/30 rounded-lg px-3 py-2 text-on-surface text-sm focus:border-primary outline-none"
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                        

                      </div>
                    )}
                    
                    <div className="grid grid-cols-1 gap-2">
                      {mode === 'audio' ? (
                        <>
                          <QualityOption
                            id="320"
                            label="Ultra MP3"
                            sub="320kbps • Estúdio"
                            selected={quality}
                            set={setQuality}
                          />
                          <QualityOption
                            id="high"
                            label="Alta Qualidade"
                            sub="192kbps • Padrão Spotify"
                            selected={quality}
                            set={setQuality}
                          />
                          <QualityOption
                            id="medium"
                            label="Economia de Dados"
                            sub="128kbps • Leve"
                            selected={quality}
                            set={setQuality}
                          />
                          <QualityOption
                            id="flac"
                            label="Lossless FLAC"
                            sub="Sem compressão"
                            selected={quality}
                            set={setQuality}
                          />
                          <QualityOption
                            id="best"
                            label="Original"
                            sub="M4A/Opus sem conversão"
                            selected={quality}
                            set={setQuality}
                          />
                          {quality === 'flac' && (
                            <div className="flex items-start gap-3 mt-4 p-4 bg-tertiary/10 border border-tertiary/30 rounded-xl">
                              <AlertCircle size={20} className="text-tertiary flex-shrink-0 mt-0.5" />
                              <div>
                                <h5 className="text-sm font-semibold text-tertiary mb-1">Aviso sobre o formato FLAC</h5>
                                <p className="text-xs text-on-surface-variant leading-relaxed">
                                  O YouTube fornece áudio original com qualidade máxima de 256kbps (Opus/AAC). 
                                  A conversão para FLAC gerará um arquivo bem maior, mas <strong>não aumentará a qualidade real do áudio</strong> além da fonte original.
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {metadata.resolutions && metadata.resolutions.length > 0 ? (
                            metadata.resolutions.map((res) => {
                              let label = `${res}p`;
                              let sub = "Qualidade Padrão";
                              if (res >= 2160) { label = "4K Ultra HD"; sub = "Definição Máxima (WebM/MKV)"; }
                              else if (res >= 1440) { label = "2K Quad HD"; sub = "Alta Definição Superior"; }
                              else if (res >= 1080) { label = "Full HD 1080p"; sub = "Padrão MP4"; }
                              else if (res >= 720) { label = "HD 720p"; sub = "Leve e Rápido (MP4)"; }
                              else if (res >= 480) { label = "480p"; sub = "Qualidade DVD"; }
                              else { label = `${res}p`; sub = "Economia de Dados"; }

                              return (
                                <QualityOption
                                  key={res}
                                  id={`${res}p`}
                                  label={label}
                                  sub={sub}
                                  selected={quality}
                                  set={setQuality}
                                />
                              );
                            })
                          ) : (
                            <div className="p-4 bg-error-container border border-error/20 rounded-xl text-center">
                              <p className="text-on-error-container text-sm font-medium">Nenhuma qualidade de vídeo encontrada.</p>
                            </div>
                          )}

                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={reset}
                      className="px-4 py-3 rounded-full hover:bg-on-surface/5 text-on-surface-variant font-medium transition-colors"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      onClick={handleDownload}
                      className="flex-1 bg-primary hover:bg-primary/90 text-on-primary rounded-full font-bold shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                    >
                      <Download className="w-5 h-5" />
                      {metadata.is_playlist && (metadata.url?.includes('v=') || metadata.url?.includes('youtu.be/')) 
                        ? t('confirmDownload') 
                        : t('confirmDownload')}
                    </button>
                  </div>
                </div>
              )}

              {step === 'downloading' && (
                <div className="py-6 text-center space-y-4">
                  <div className="relative w-full h-4 bg-surface-container-highest rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.percent}%` }}
                      transition={{ ease: "linear" }}
                      className="absolute h-full bg-primary"
                    />
                  </div>

                  <div className="flex justify-between text-sm text-secondary px-1">
                    <span>
                      {progress.percent < 99
                        ? t('statusDownloading')
                        : t('statusProcessing')}
                    </span>
                    <span className="font-mono">{Math.round(progress.percent)}%</span>
                  </div>

                  {progress.percent < 99 && (
                    <div className="flex justify-between text-xs text-secondary/70 px-1 font-mono">
                      <span>{progress.downloaded || '---'} / {progress.total || '---'}</span>
                      <span>{progress.speed || 'Calculando...'}</span>
                    </div>
                  )}

                  <p className="text-xs text-secondary/50">
                    {progress.percent === 100 ? 'Quase lá, finalizando o arquivo...' : 'Aguarde um momento'}
                  </p>
                  <div className="mt-6 rounded-2xl border border-outline-variant/30 bg-surface-container-low p-4 text-left space-y-3">
                    <div>
                      <p className="text-sm font-bold text-on-surface">Baixar em seguida</p>
                      <p className="text-xs text-on-surface-variant">O próximo link usará {frozenDownloadOptionsRef.current?.quality || quality} e as mesmas configurações deste download.</p>
                    </div>
                    <div className="flex gap-2">
                      <input value={nextDownloadInput} onChange={(event) => setNextDownloadInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addConsecutiveDownload(); } }} placeholder="Cole o próximo link aqui..." className="min-w-0 flex-1 rounded-full border border-outline-variant/40 bg-surface-container-high px-4 py-2 text-sm text-on-surface outline-none focus:border-primary" />
                      <button onClick={addConsecutiveDownload} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90"><Plus size={17} /></button>
                    </div>
                    {consecutiveDownloads.length > 0 && <div className="space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-primary">A seguir ({consecutiveDownloads.length})</p>
                      {consecutiveDownloads.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
                        <span className="font-mono text-primary">{index + 1}</span><span className="min-w-0 flex-1 truncate" title={item.url}>{item.url}</span>
                        <button onClick={() => replaceConsecutiveDownloads(previous => previous.filter(entry => entry.id !== item.id))} className="rounded-full p-1 hover:bg-error/10 hover:text-error" title="Remover"><X size={14} /></button>
                      </div>)}
                    </div>}
                  </div>
                </div>
              )}

              {step === 'result' && (
                <div className="py-4 text-center space-y-4 bg-green-500/10 rounded-2xl border border-green-500/20">
                  <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-500/30">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-green-400">Sucesso!</h3>
                    <p className="text-green-200/80 text-sm px-4 break-all">{downloadInfo?.file}</p>
                    <p className="text-xs text-green-200/50 mt-1">Salvo na pasta downloads</p>
                  </div>
                  <div className="flex gap-2 justify-center mt-4">
                    <button
                      onClick={() => setCurrentSong({ ...downloadInfo, thumbnail: metadata?.thumbnail })}
                      className="px-6 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                    >
                      <Play size={16} fill="currentColor" /> Tocar
                    </button>
                    <button
                      onClick={reset}
                      className="px-6 py-2 bg-surface hover:bg-white/10 rounded-xl text-sm font-medium transition-colors"
                    >
                      {t('downloadAnother') || "Baixar Outra"}
                    </button>
                    <button
                      onClick={() => axios.post(getApiUrl('/open_folder'))}
                      className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                    >
                      📂 {t('openFolder') || "Abrir Pasta"}
                    </button>
                  </div>
                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>

        {/* Global Error Toast */}
        <AnimatePresence>
          {status === 'error' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-900/90 backdrop-blur text-white px-6 py-3 rounded-3xl shadow-2xl border border-red-500/30 flex flex-col items-center gap-2 z-50 whitespace-pre-wrap max-w-[90vw] md:max-w-lg text-center"
            >
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="font-medium text-sm leading-snug">{message}</span>
            </motion.div>
          )}
        </AnimatePresence>

      </div>


      {/* Floating Queue Button */}
      {queue.length > 0 && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => setShowQueue(true)}
          className={`fixed right-6 z-[90] bg-white/10 backdrop-blur-2xl border border-white/20 text-white p-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:bg-white/20 hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 group ${currentSong ? 'bottom-28' : 'bottom-6'}`}
        >
          <div className="relative">
            <List size={24} />
            <div className="absolute -top-2 -right-2 bg-white text-black text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full shadow-md">
              {queue.filter(i => i.status !== 'completed').length}
            </div>
          </div>
          <span className="max-w-0 overflow-hidden group-hover:max-w-xs transition-all duration-300 font-medium whitespace-nowrap">
            {t('queueTitle')}
          </span>
        </motion.button>
      )}

      {/* Queue Drawer */}
      <AnimatePresence>
        <QueueDrawer
        showQueue={showQueue}
        setShowQueue={setShowQueue}
        queue={queue}
        setQueue={setQueue}
        isProcessingQueue={isProcessingQueue}
        processQueue={processQueue}
        removeFromQueue={removeFromQueue}
        setCurrentSong={setCurrentSong}
        updateQueueItem={updateQueueItem}
        globalJobs={globalJobs}
        getApiUrl={getApiUrl}
      />
      </AnimatePresence>

      <PlaylistModal
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
        metadata={metadata}
        playlistLimit={playlistLimit}
        setPlaylistLimit={setPlaylistLimit}
        fetchPlaylistDetails={fetchPlaylistDetails}
        selectedVideos={selectedVideos}
        setSelectedVideos={setSelectedVideos}
        playlistVideos={playlistVideos}
        deselectAllVideos={deselectAllVideos}
        downloadSelectedVideos={downloadSelectedVideos}
        toggleVideoSelection={toggleVideoSelection}
        playlistLoading={playlistLoading}
        executeRetry={executeRetry}
      />

      {/* Removed footer */}

      {/* Player Bar */}
      <AnimatePresence>
        {currentSong && (
          <PlayerBar
            currentSong={currentSong}
            onClose={() => setCurrentSong(null)}
            onNext={handleNextTrack}
            onPrev={handlePrevTrack}
            onFinish={handleNextTrack}
            isShuffle={isShuffle}
            setIsShuffle={setIsShuffle}
          />
        )}
      </AnimatePresence>

      <SpotifyModal
        showSpotifyModal={showSpotifyModal}
        setShowSpotifyModal={setShowSpotifyModal}
        spotifyInputUrl={spotifyInputUrl}
        setSpotifyInputUrl={setSpotifyInputUrl}
        setUrl={setUrl}
        loadVideoDetails={loadVideoDetails}
      />

      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        getApiUrl={getApiUrl}
        onPlaySong={(song, playlist) => {
          setCurrentSong(song);
          if (playlist) setCurrentPlaylist(playlist);
        }}
        onEditTags={(song) => setTagEditorSong(song)}
      />

      <TagEditorModal
        isOpen={!!tagEditorSong}
        onClose={() => setTagEditorSong(null)}
        song={tagEditorSong}
        getApiUrl={getApiUrl}
        onSaved={() => {
          // You could optionally refresh the library here
        }}
      />

      <HistoryModal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        apiUrl={getApiUrl('')}
        onRedownload={(urlToDownload) => {
          setUrl(urlToDownload);
          setStep('search');
        }}
      />
      
      <MobileSyncModal
        isOpen={showMobileSync}
        onClose={() => setShowMobileSync(false)}
      />

      <SubscriptionsModal
        isOpen={showSubscriptionsModal}
        onClose={() => setShowSubscriptionsModal(false)}
      />
    </div>
      {/* New Converter Modal */}
      <AnimatePresence>
        <ConverterModal
          isOpen={showConverter}
          onClose={() => setShowConverter(false)}
          apiUrl={getApiUrl()}
        />
      </AnimatePresence>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </>
  );
}


export default App;
