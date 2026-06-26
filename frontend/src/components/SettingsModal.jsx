import React, { useState, useEffect } from 'react';

import axios from 'axios';
import { Settings, CheckCircle, AlertCircle, Upload, Mic, Power, Terminal, Database, RefreshCw, Globe, Palette, Download, Monitor, Cloud } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogViewerModal } from './LogViewerModal';
import { t, setLanguage, getLanguage, LANGUAGES } from '../i18n';

export function SettingsModal({ isOpen, onClose, isAuthenticated, organizeByArtist, setOrganizeByArtist, onUploadSuccess, apiUrl, onLanguageChange, wallpaper, setWallpaper, blurLevel, setBlurLevel }) {
  const [downloadFolder, setDownloadFolder] = React.useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [activeLang, setActiveLang] = useState(getLanguage());
  const [lastfmUser, setLastfmUser] = useState('');
  const [lastfmPass, setLastfmPass] = useState('');
  const [isSavingLastfm, setIsSavingLastfm] = useState(false);
  
  const [voiceStatus, setVoiceStatus] = useState('stopped');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      fetchVoiceStatus();
    }
  }, [isOpen]);

  
  
  const handleSaveTelegram = async () => {
    try {
      await axios.post(`${apiUrl}/api/settings/telegram`, { token: telegramToken, chat_id: telegramChatId, enabled: telegramEnabled });
      // saved silently or toast
    } catch { /* Settings save failures are surfaced by the next status refresh. */ }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await axios.post(`${apiUrl}/api/settings/telegram/test`, { token: telegramToken, chat_id: telegramChatId });
      alert(res.data.message);
      handleSaveTelegram(); // save if test succeeds
    } catch(e) {
      alert(e.response?.data?.detail || "Erro ao testar o Telegram.");
    } finally {
      setIsTestingTelegram(false);
    }
  };

  const handleSaveLastfm = async () => {
    setIsSavingLastfm(true);
    try {
      await axios.post(`${apiUrl}/api/settings/lastfm`, { username: lastfmUser, password: lastfmPass });
      alert(lastfmUser && lastfmPass ? "Login do Last.fm confirmado e salvo com sucesso!" : "Credenciais do Last.fm removidas.");
    } catch(e) { 
      alert(e.response?.data?.detail || "Erro ao conectar com Last.fm"); 
    } finally {
      setIsSavingLastfm(false);
    }
  };

  const fetchVoiceStatus = async () => {
    try {
      const res = await axios.get(`${apiUrl}/api/voice/status`);
      setVoiceStatus(res.data.status);
    } catch (e) {
      console.error('Failed to get voice status', e);
        alert('Erro ao checar status do motor de voz: ' + e.message);
    }
  };

  const toggleVoice = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/voice/toggle`);
      setVoiceStatus(res.data.status);
      if (res.data.status === 'downloading') {
          // Poll every 3 seconds while downloading
          const interval = setInterval(async () => {
              const check = await axios.get(`${apiUrl}/api/voice/status`);
              setVoiceStatus(check.data.status);
              if (check.data.status !== 'downloading') clearInterval(interval);
          }, 3000);
      }
    } catch (e) {
      console.error('Failed to toggle voice', e);
        alert('Erro ao ativar motor de voz: ' + e.message);
    }
  };
  const [concurrentDownloads, setConcurrentDownloads] = React.useState(2);
  const [startWithWindows, setStartWithWindows] = useState(() => localStorage.getItem('app_start_windows') === 'true');
  const [startMinimized, setStartMinimized] = useState(false);
  const [miniplayerHotkey, setMiniplayerHotkey] = useState('ctrl+shift+m');
  const [isRecordingHotkey, setIsRecordingHotkey] = useState(false);
  const [activeTab, setActiveTab] = useState('appearance');

  const handleDbSync = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await axios.get(`${apiUrl}/api/db/sync`);
      setSyncResult(res.data);
    } catch {
      setSyncResult({ error: t('toastError') });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncResult(null), 5000);
    }
  };

  const handleLangChange = (code) => {
    setLanguage(code);
    setActiveLang(code);
    // Force a re-render of the whole app
    if (typeof onLanguageChange === 'function') onLanguageChange(code);
  };

  const handleWallpaperUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type.startsWith('video/')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await axios.post(`${apiUrl}/api/upload_wallpaper`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        if (res.data.status === 'success') {
          const relativeUrl = res.data.url;
          if (setWallpaper) setWallpaper(relativeUrl);
          localStorage.setItem('app_wallpaper', relativeUrl);
        }
      } catch (err) {
        alert("Erro ao enviar vídeo. Tente novamente.");
        console.error(err);
      }
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Comprimir imagens grandes para não exceder a cota do localStorage
        const MAX_WIDTH = 1280;
        const MAX_HEIGHT = 720;
        
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        // Converter para JPEG com qualidade de 70%
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        try {
          if (setWallpaper) setWallpaper(compressedBase64);
          localStorage.setItem('app_wallpaper', compressedBase64);
        } catch (err) {
          alert("Erro: A imagem ainda é muito grande para salvar (QuotaExceededError). Tente outra.");
          console.error(err);
        }
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleClearWallpaper = () => {
    if (setWallpaper) setWallpaper('');
    localStorage.removeItem('app_wallpaper');
  };

  const toggleStartWithWindows = async () => {
    const newVal = !startWithWindows;
    setStartWithWindows(newVal);
    localStorage.setItem('app_start_windows', newVal);
    try {
      await axios.post(`${apiUrl}/api/system/startup?enable=${newVal}`);
    } catch (err) {
      console.error("Erro ao configurar inicialização:", err);
        alert('Erro ao configurar inicialização junto ao Windows: ' + err.message);
    }
  };

  React.useEffect(() => {
    if (isOpen) {
      axios.get(`${apiUrl}/api/settings/download_folder`)
        .then(res => setDownloadFolder(res.data.folder))
        .catch(console.error);
      axios.get(`${apiUrl}/api/settings/concurrent_downloads`)
        .then(res => setConcurrentDownloads(res.data.value))
        .catch(console.error);
      axios.get(`${apiUrl}/api/settings/start_minimized`)
        .then(res => setStartMinimized(res.data.value))
        .catch(console.error);
      axios.get(`${apiUrl}/api/settings/miniplayer_hotkey`)
        .then(res => setMiniplayerHotkey(res.data.hotkey))
        .catch(console.error);
      axios.get(`${apiUrl}/api/settings/lastfm`)
        .then(res => { setLastfmUser(res.data.username); setLastfmPass(res.data.password); })
        .catch(console.error);
      axios.get(`${apiUrl}/api/settings/telegram`)
        .then(res => { setTelegramToken(res.data.token); setTelegramChatId(res.data.chat_id); setTelegramEnabled(res.data.enabled !== false); })
        .catch(console.error);
    }
  }, [isOpen, apiUrl]);

  const handleConcurrentChange = async (val) => {
    setConcurrentDownloads(val);
    try {
      await axios.post(`${apiUrl}/api/settings/concurrent_downloads`, { value: val });
    } catch (e) {
      console.error('Failed to save concurrent downloads setting', e);
        alert('Erro ao salvar limite de downloads: ' + e.message);
    }
  };

  const handleChooseFolder = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/settings/choose_folder`);
      if (res.data.status === 'ok') {
        setDownloadFolder(res.data.folder);
      } else {
        alert(res.data.message);
      }
    } catch (e) {
      alert("Erro ao conectar com o servidor: " + e.message);
    }
  };

  const handleSaveHotkey = async (newHotkey) => {
    setMiniplayerHotkey(newHotkey);
    try {
      await axios.post(`${apiUrl}/api/settings/miniplayer_hotkey`, { hotkey: newHotkey });
    } catch (e) {
      console.error(e);
    }
  };

  const handleHotkeyKeyDown = (e) => {
    e.preventDefault();
    if (e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') return;
    
    let keys = [];
    if (e.ctrlKey) keys.push('ctrl');
    if (e.altKey) keys.push('alt');
    if (e.shiftKey) keys.push('shift');
    
    // Allow alphanumeric characters only, to avoid OS bugs with media keys
    const isAlphanumeric = /^[a-z0-9]$/i.test(e.key);
    if (!isAlphanumeric) return;
    
    keys.push(e.key.toLowerCase());
    
    if (keys.length > 0) {
      const finalHotkey = keys.join('+');
      handleSaveHotkey(finalHotkey);
      setIsRecordingHotkey(false);
    }
  };

  if (!isOpen) return null;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name !== 'cookies.txt') {
      alert("O arquivo deve se chamar exatamente 'cookies.txt'");
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post(`${apiUrl}/upload_cookies`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onUploadSuccess();
    } catch (error) {
      alert("Erro ao enviar arquivo. Verifique o console.");
      console.error(error);
    }
  };

  const handleShutdown = async () => {
    if (!confirm(t('settingsShutdownConfirm'))) return;

    try {
      try { window.close(); } catch { /* Desktop shells may block window.close(). */ }

      await axios.post(`${apiUrl}/shutdown`);

      document.body.innerHTML = `
        <div style="height: 100vh; background: #000; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #ef4444; font-family: sans-serif;">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path>
            <line x1="12" y1="2" x2="12" y2="12"></line>
          </svg>
          <h1 style="margin-top: 20px; font-size: 24px;">${t('settingsShutdownSuccess')}</h1>
          <p style="opacity: 0.5; margin-top: 10px;">${t('settingsShutdownCloseTab')}</p>
        </div>
      `;
    } catch (e) {
      alert("Erro ao comunicar com o servidor: " + e.message);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface-container border border-outline-variant/30 rounded-4xl w-full max-w-4xl p-0 shadow-2xl relative max-h-[90vh] flex flex-col md:flex-row overflow-hidden"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 z-50 bg-surface-container rounded-full w-8 h-8 flex items-center justify-center transition-colors">X</button>

        {/* Sidebar Tabs */}
        <div className="bg-surface-container-high w-full md:w-64 flex-shrink-0 p-6 flex flex-col border-r border-outline-variant/20">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-primary-container rounded-xl">
              <Settings className="w-6 h-6 text-on-primary-container" />
            </div>
            <h2 className="text-xl font-bold text-white">{t('settingsTitle')}</h2>
          </div>
          
          <div className="flex flex-row md:flex-col gap-2 overflow-x-auto custom-scrollbar pb-2 md:pb-0">
            <button
              onClick={() => setActiveTab('appearance')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'appearance' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
            >
              <Palette size={18} /> {t('settingsTabAppearance') || 'Aparência'}
            </button>
            <button
              onClick={() => setActiveTab('downloads')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'downloads' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
            >
              <Download size={18} /> {t('settingsTabDownloads') || 'Downloads'}
            </button>
            <button
              onClick={() => setActiveTab('system')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'system' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
            >
              <Monitor size={18} /> {t('settingsTabSystem') || 'Sistema'}
            </button>
            <button
              onClick={() => setActiveTab('cloud')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'cloud' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
            >
              <Cloud size={18} /> {t('settingsTabCloud') || 'Nuvem & Sync'}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar bg-surface-container relative">

          {/* TAB 4: CLOUD & SYNC */}
          {activeTab === 'cloud' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 border-b border-outline-variant/20 pb-4">
                <Cloud className="w-5 h-5 text-primary" /> Nuvem & Sincronização
              </h3>

              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Backup Infinito (Telegram)</h4>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      O Lumina pode enviar automaticamente todas as músicas baixadas para o seu chat privado ou canal no Telegram. 
                      É um backup gratuito e infinito na nuvem, acessível do seu celular.
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between p-3 bg-surface-container-low border border-outline-variant/20 rounded-2xl mb-2">
                  <div>
                    <h5 className="text-sm font-bold text-on-surface">Ativar Backup na Nuvem</h5>
                    <p className="text-[10px] text-on-surface-variant">Habilita ou desabilita o envio automático para o Telegram.</p>
                  </div>
                  <button
                    onClick={() => {
                      const newVal = !telegramEnabled;
                      setTelegramEnabled(newVal);
                      setTimeout(() => {
                        axios.post(`${apiUrl}/api/settings/telegram`, { token: telegramToken, chat_id: telegramChatId, enabled: newVal }).catch(console.error);
                      }, 0);
                    }}
                    className={`w-12 h-6 rounded-full transition-colors relative flex items-center ${telegramEnabled ? 'bg-primary' : 'bg-surface-variant'}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full absolute transition-transform ${telegramEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant ml-1">Bot Token (via @BotFather)</label>
                    <input
                      type="text"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      onBlur={handleSaveTelegram}
                      placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant ml-1">Chat ID (Onde o bot vai enviar)</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      onBlur={handleSaveTelegram}
                      placeholder="Ex: 12345678 ou -100987654321"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram || !telegramToken || !telegramChatId}
                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-lg shadow-blue-500/20 flex justify-center items-center gap-2"
                  >
                    {isTestingTelegram ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {isTestingTelegram ? 'Testando Conexão...' : 'Testar Conexão com Telegram'}
                  </button>
                </div>
              </div>
            </div>
          )}

          
          {/* TAB 1: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 border-b border-outline-variant/20 pb-4">
                <Palette className="w-5 h-5 text-primary" /> {t('settingsHeaderAppearance') || 'Aparência & Interface'}
              </h3>

              {/* Language Selector */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-3">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-4 h-4 text-primary" />
                  <h4 className="font-bold text-white text-sm">{t('settingsLanguage')}</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      onClick={() => handleLangChange(lang.code)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 px-3 rounded-2xl border text-sm font-medium transition-all
                        ${activeLang === lang.code
                          ? 'bg-primary-container border-primary-container text-on-primary-container shadow-lg shadow-primary/10'
                          : 'bg-surface-container-low border-outline-variant/30 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
                    >
                      <span className="text-lg">{lang.flag}</span>
                      <span className="text-xs">{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>

                            {/* Voice Command Toggle */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-3">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-primary" /> {t('settingsVoiceCommand') || 'Comandos de Voz (BETA)'}
                </h4>
                <p className="text-xs text-warning/80 bg-warning/10 p-2 rounded-xl">
                  {t('settingsVoiceWarning') || '⚠️ Aviso: Esta função está em fase de testes.'}
                </p>
                <button 
                  onClick={toggleVoice} 
                  disabled={voiceStatus === 'downloading'}
                  className={`w-full py-2 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all ${
                    voiceStatus === 'running' 
                      ? 'bg-primary text-on-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]' 
                      : voiceStatus === 'downloading' 
                        ? 'bg-secondary text-on-secondary animate-pulse' 
                        : 'bg-surface-container-highest text-on-surface hover:bg-surface-variant'
                  }`}
                >
                  <Mic size={16} className={voiceStatus === 'running' ? 'animate-pulse' : ''} />
                  {voiceStatus === 'running' 
                    ? t('settingsVoiceOn') || 'Microfone Ligado (Escutando...)' 
                    : voiceStatus === 'downloading' 
                      ? t('settingsVoiceDownloading') || 'Baixando Motor de Voz (40MB)...' 
                      : t('settingsVoiceActivate') || 'Ativar Reconhecimento de Voz'}
                </button>
              </div>

{/* Wallpaper Personalization */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-3">
                <h4 className="font-bold text-white flex items-center gap-2">
                  <Upload className="w-4 h-4 text-primary" /> {t('settingsWallpaperHeader') || 'Wallpaper / Tema Monet'}
                </h4>
                <p className="text-xs text-on-surface-variant">{t('settingsWallpaperDesc') || 'Escolha uma imagem ou vídeo para colorir o app dinamicamente (M3).'}</p>
                <div className="flex gap-2">
                  <label className="flex-1 cursor-pointer bg-primary hover:bg-primary/90 text-on-primary text-sm font-bold py-2 rounded-full transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                    <Upload size={16} /> {t('settingsWallpaperChoose') || 'Escolher Arquivo'}
                    <input type="file" accept="image/*,video/*" className="hidden" onChange={handleWallpaperUpload} />
                  </label>
                  {wallpaper && (
                    <button
                      onClick={handleClearWallpaper}
                      className="px-4 py-2 bg-error/20 hover:bg-error/30 text-error rounded-full text-sm font-bold transition-colors"
                    >
                      {t('settingsWallpaperRemove') || 'Remover'}
                    </button>
                  )}
                </div>

                {wallpaper && (
                  <div className="pt-2">
                    <h4 className="font-bold text-white text-xs mb-2">{t('settingsBlurLevel') || 'Intensidade do Desfoque'}</h4>
                    <div className="flex gap-2 bg-surface-container-low p-1 rounded-2xl border border-outline-variant/20">
                      {[
                        { id: 'none', label: t('settingsBlurNone') || 'Sem Desfoque' },
                        { id: 'sm', label: t('settingsBlurSm') || 'Suave' },
                        { id: 'md', label: t('settingsBlurMd') || 'Médio' },
                        { id: '3xl', label: t('settingsBlur3xl') || 'Forte' },
                      ].map(b => (
                        <button
                          key={b.id}
                          onClick={() => {
                            if (setBlurLevel) setBlurLevel(b.id);
                            localStorage.setItem('app_blur_level', b.id);
                          }}
                          className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-medium transition-all ${blurLevel === b.id
                              ? 'bg-primary text-on-primary shadow-sm'
                              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
                            }`}
                        >
                          {b.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: DOWNLOADS */}
          {activeTab === 'downloads' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 border-b border-outline-variant/20 pb-4">
                <Download className="w-5 h-5 text-primary" /> {t('settingsDownloadsHeader') || 'Downloads & Autenticação'}
              </h3>

              {/* Auth Status */}
              <div className={`p-4 rounded-xl border ${isAuthenticated ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                <div className="flex items-center gap-3">
                  {isAuthenticated ? <CheckCircle className="text-green-400" /> : <AlertCircle className="text-red-400" />}
                  <div>
                    <h3 className={`font-bold ${isAuthenticated ? 'text-green-400' : 'text-red-400'}`}>
                      {isAuthenticated ? t('settingsConnected') : t('settingsNotConnected')}
                    </h3>
                    <p className="text-sm text-secondary/80">
                      {isAuthenticated ? 'Você pode baixar vídeos em alta qualidade.' : 'Downloads podem falhar (Erro 403).'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cookies Info & Upload */}
              {!isAuthenticated && (
                <div className="space-y-3 bg-surface-container-high p-4 rounded-3xl border border-outline-variant/30">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-primary-container rounded-xl shrink-0">
                      <AlertCircle className="w-5 h-5 text-on-primary-container" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white mb-1">{t('settingsCookies')}</h4>
                      <p className="text-xs text-on-surface-variant leading-relaxed">{t('settingsCookiesDesc')}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <h4 className="text-sm font-bold text-white mb-3">{t('settingsCookiesHowTo')}</h4>
                    <div className="space-y-3 text-sm text-secondary">
                      <div className="flex gap-3 items-center bg-black/20 p-3 rounded-lg border border-white/5">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs shrink-0">1</span>
                        <p dangerouslySetInnerHTML={{ __html: t('settingsCookiesStep1') }}></p>
                      </div>
                      <div className="flex gap-3 items-center bg-black/20 p-3 rounded-lg border border-white/5">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs shrink-0">2</span>
                        <p dangerouslySetInnerHTML={{ __html: t('settingsCookiesStep2') }}></p>
                      </div>
                      <div className="flex gap-3 items-center bg-black/20 p-3 rounded-lg border border-white/5">
                        <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary font-bold text-xs shrink-0">3</span>
                        <p dangerouslySetInnerHTML={{ __html: t('settingsCookiesStep3') }}></p>
                      </div>
                    </div>
                  </div>
                  <div className="relative group mt-4">
                    <input
                      type="file"
                      accept=".txt"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-outline-variant/50 group-hover:border-primary group-hover:bg-primary-container/20 rounded-3xl p-6 flex flex-col items-center justify-center transition-all text-center gap-2">
                      <Upload className="w-8 h-8 text-on-surface-variant group-hover:text-primary transition-colors" />
                      <p className="text-sm font-medium text-white">{t('settingsUploadCookies')}</p>
                      <p className="text-xs text-on-surface-variant">{t('settingsUploadCookiesDesc')}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Download Folder */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-3">
                <h4 className="font-bold text-white">{t('settingsDownloadFolder')}</h4>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={downloadFolder}
                    readOnly
                    className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none overflow-hidden text-ellipsis whitespace-nowrap"
                    placeholder={t('loading')}
                  />
                  <button
                    onClick={handleChooseFolder}
                    className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-sm font-bold rounded-full transition-colors whitespace-nowrap shadow-lg shadow-primary/20"
                  >
                    {t('settingsChangeFolder')}
                  </button>
                </div>
              </div>

              {/* Concurrent Downloads Slider */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-white text-sm">{t('settingsConcurrent') || 'Downloads Simultâneos'}</h4>
                    {concurrentDownloads > 4 ? (
                      <p className="text-xs text-error mt-0.5">⚠️ Valores altos podem causar travamentos por alto uso de CPU/RAM.</p>
                    ) : (
                      <p className="text-xs text-on-surface-variant mt-0.5">Acelera filas, mas usa mais do PC.</p>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary min-w-[2rem] text-right">{concurrentDownloads}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={8}
                  step={1}
                  value={concurrentDownloads}
                  onChange={(e) => handleConcurrentChange(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-secondary/60 px-0.5">
                  <span>1 (Seq)</span>
                  <span>4</span>
                  <span>8 (Máx)</span>
                </div>
              </div>

              {/* Organize by Artist */}
              <div className="flex items-center justify-between p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30">
                <div>
                  <h4 className="font-bold text-white">{t('settingsOrganizeArtist')}</h4>
                  <p className="text-xs text-on-surface-variant mt-0.5">{t('settingsOrganizeArtistDesc')}</p>
                </div>
                <button
                  onClick={() => {
                    const newValue = !organizeByArtist;
                    setOrganizeByArtist(newValue);
                    localStorage.setItem('organizeByArtist', newValue.toString());
                  }}
                  className={`relative w-14 h-8 rounded-full transition-colors border ${organizeByArtist ? 'bg-primary border-primary' : 'bg-surface-container-highest border-outline-variant'}`}
                >
                  <motion.div
                    animate={{ x: organizeByArtist ? 26 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`absolute top-1 w-5 h-5 rounded-full shadow-lg ${organizeByArtist ? 'bg-on-primary' : 'bg-outline'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM */}
          {activeTab === 'system' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 border-b border-outline-variant/20 pb-4">
                <Monitor className="w-5 h-5 text-primary" /> Sistema & Avançado
              </h3>

              {/* System Integration */}
              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-4">
                <h4 className="font-bold text-on-surface flex items-center gap-2">
                  <Settings className="w-4 h-4 text-primary" /> Sistema Operacional
                </h4>

                {/* Toggle: Iniciar com Windows */}
                <div className="flex items-center justify-between p-3 hover:bg-surface-container rounded-2xl transition-colors cursor-pointer" onClick={toggleStartWithWindows}>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Iniciar junto com o Windows</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">O app inicia automaticamente quando o sistema ligar.</p>
                  </div>
                  <button className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ml-4 ${startWithWindows ? 'bg-primary' : 'bg-surface-container-highest border border-outline-variant'}`}>
                    <motion.div
                      animate={{ x: startWithWindows ? 22 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={`absolute top-1 w-5 h-5 rounded-full shadow ${startWithWindows ? 'bg-on-primary' : 'bg-outline'}`}
                    />
                  </button>
                </div>

                {/* Toggle: Iniciar Minimizado */}
                <div className="flex items-center justify-between p-3 hover:bg-surface-container rounded-2xl transition-colors cursor-pointer" onClick={async () => {
                  const newVal = !startMinimized;
                  setStartMinimized(newVal);
                  try { await axios.post(`${apiUrl}/api/settings/start_minimized`, { value: newVal }); } catch { /* Keep the local toggle responsive. */ }
                }}>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Iniciar minimizado na bandeja</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">Ao iniciar, o app fica oculto na bandeja do sistema (perto do relógio).</p>
                  </div>
                  <button className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ml-4 ${startMinimized ? 'bg-primary' : 'bg-surface-container-highest border border-outline-variant'}`}>
                    <motion.div
                      animate={{ x: startMinimized ? 22 : 2 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      className={`absolute top-1 w-5 h-5 rounded-full shadow ${startMinimized ? 'bg-on-primary' : 'bg-outline'}`}
                    />
                  </button>
                </div>

                {/* Hotkey: Mini Player */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-surface-container-highest border border-outline-variant/20 rounded-2xl">
                  <div className="mb-2 sm:mb-0">
                    <p className="text-sm font-semibold text-on-surface">Atalho do Mini Player</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 max-w-[250px]">Atalho global para mostrar ou esconder o Mini Player em qualquer lugar.</p>
                  </div>
                  <input 
                    type="text" 
                    readOnly 
                    value={isRecordingHotkey ? "Pressione as teclas..." : miniplayerHotkey}
                    onClick={() => setIsRecordingHotkey(true)}
                    onBlur={() => setIsRecordingHotkey(false)}
                    onKeyDown={isRecordingHotkey ? handleHotkeyKeyDown : undefined}
                    className={`w-40 text-center px-3 py-2 rounded-xl text-sm font-mono transition-colors outline-none cursor-pointer ${isRecordingHotkey ? 'bg-primary text-on-primary ring-2 ring-primary/50' : 'bg-surface-container text-on-surface border border-outline-variant/30 hover:border-primary/50'}`}
                  />
                </div>
              </div>

              {/* System Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => setShowLogs(true)}
                  className="w-full py-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-white rounded-2xl transition-all flex items-center justify-center gap-2 group"
                >
                  <Terminal className="w-5 h-5 group-hover:text-primary transition-colors text-on-surface-variant" />
                  <span className="font-bold text-sm text-on-surface">{t('logs')}</span>
                </button>

                <button
                  onClick={handleDbSync}
                  disabled={isSyncing}
                  className="w-full py-3 bg-surface-container-low hover:bg-surface-container border border-outline-variant/30 text-white rounded-2xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {isSyncing
                    ? <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                    : <Database className="w-5 h-5 group-hover:text-primary transition-colors text-on-surface-variant" />
                  }
                  <span className="font-bold text-sm text-on-surface">
                    {isSyncing ? t('settingsDbSyncing') : t('settingsDbSync')}
                  </span>
                </button>

                {syncResult && !syncResult.error && (
                  <div className="text-xs text-center py-2 px-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400">
                    {t('toastSyncDone', syncResult.checked, syncResult.marked_missing)}
                  </div>
                )}
                {syncResult?.error && (
                  <div className="text-xs text-center py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400">
                    {syncResult.error}
                  </div>
                )}
              </div>


              <div className="pt-4 mt-4 border-t border-outline-variant/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <span>🎵</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface">Last.fm Scrobbling</p>
                    <p className="text-xs text-on-surface-variant">Registre automaticamente</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant">Usuario</label>
                    <input
                      type="text"
                      value={lastfmUser}
                      onChange={(e) => setLastfmUser(e.target.value)}
                      
                      className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant">Senha</label>
                    <input
                      type="password"
                      value={lastfmPass}
                      onChange={(e) => setLastfmPass(e.target.value)}
                      
                      className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                    />
                  </div>
                </div>
                  <div className="flex justify-end mt-4">
                    <button 
                      onClick={handleSaveLastfm}
                      disabled={isSavingLastfm}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-lg"
                    >
                      {isSavingLastfm ? 'Testando login...' : 'Salvar Login do Last.fm'}
                    </button>
                  </div>
              </div>

              {/* Shutdown */}
              <div className="pt-4 mt-4">
                <button
                  onClick={handleShutdown}
                  className="w-full py-3 bg-error-container/10 hover:bg-error-container/30 border border-error/20 hover:border-error/50 text-error rounded-2xl transition-all flex items-center justify-center gap-2 group"
                >
                  <Power className="w-5 h-5 group-hover:text-error transition-colors" />
                  <span className="font-bold text-sm">{t('settingsShutdownApp')}</span>
                </button>
              </div>
            </div>
          )}

        </div>
      </motion.div>

      <AnimatePresence>
        <LogViewerModal
          isOpen={showLogs}
          onClose={() => setShowLogs(false)}
          apiUrl={apiUrl}
        />
      </AnimatePresence>
    </div>
  );
}
