import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { t } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, FolderOpen, RefreshCw, Music, Users, ChevronLeft, Disc, Mic, Heart, Edit3, Search, Radio, Download, Loader2, Clock, Mic2 , Scissors } from 'lucide-react';
import axios from 'axios';

export function LibraryModal({ isOpen, onClose, getApiUrl, onPlaySong, onEditTags, onTrimAudio, onDownload, initialArtist }) {
  const [library, setLibrary] = useState([]);
  const [studioLibrary, setStudioLibrary] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'artists' | 'favorites' | 'studio'
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [search, setSearch] = useState('');

  // ── Streaming state ──
  const [streamQuery, setStreamQuery] = useState('');
  const [streamResults, setStreamResults] = useState([]);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState('');
  const [streamPlayingId, setStreamPlayingId] = useState(null);

  // ── Discography (artist search) state ──
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState([]);
  const [artistName, setArtistName] = useState('');
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistError, setArtistError] = useState('');
  const [artistDownloading] = useState(false);

  // ── Search history (localStorage) ──
  const [streamHistory, setStreamHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lumina_stream_history') || '[]'); } catch { return []; }
  });
  const [artistHistory, setArtistHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lumina_artist_history') || '[]'); } catch { return []; }
  });

  const addToStreamHistory = (q) => {
    if (!q.trim()) return;
    const updated = [q, ...streamHistory.filter(h => h !== q)].slice(0, 8);
    setStreamHistory(updated);
    localStorage.setItem('lumina_stream_history', JSON.stringify(updated));
  };

  const addToArtistHistory = (q) => {
    if (!q.trim()) return;
    const updated = [q, ...artistHistory.filter(h => h !== q)].slice(0, 8);
    setArtistHistory(updated);
    localStorage.setItem('lumina_artist_history', JSON.stringify(updated));
  };

  useEffect(() => {
    if (isOpen) {
      fetchLibrary();
      setSelectedArtist(null);
      setSearch('');
      // If opened from PlayerBar "ver mais artista"
      if (initialArtist) {
        setActiveTab('discography');
        setArtistQuery(initialArtist);
        // Auto-trigger search
        setTimeout(() => {
          setArtistLoading(true);
          setArtistError('');
          setArtistResults([]);
          setArtistName('');
          axios.post(getApiUrl('/api/stream/artist'), { artist: initialArtist })
            .then(res => {
              setArtistResults(res.data.entries || []);
              setArtistName(res.data.artist || initialArtist);
              addToArtistHistory(initialArtist);
            })
            .catch(e => setArtistError(e.response?.data?.detail || 'Erro ao buscar discografia.'))
            .finally(() => setArtistLoading(false));
        }, 100);
      }
    }
  }, [isOpen, initialArtist]);

  const fetchLibrary = async () => {
    setLoading(true);
    try {
      const [libRes, favsRes] = await Promise.all([
        axios.get(getApiUrl('/api/library')),
        axios.get(getApiUrl('/api/favorites')),
      ]);
      setLibrary(libRes.data.library || []);
      const favs = favsRes.data.favorites || [];
      setFavorites(favs);
      setFavoriteIds(new Set(favs.map(f => f.video_id)));

      try {
        const studioRes = await axios.get(getApiUrl('/api/studio_library'));
        if (studioRes.data?.library) setStudioLibrary(studioRes.data.library);
      } catch { /* optional */ }
    } catch (e) {
      console.error('Failed to load library:', e);
    } finally {
      setLoading(false);
    }
  };

  const openFolder = async () => {
    try { await axios.post(getApiUrl('/open_folder')); } catch { /* ignore */ }
  };

  const toggleFavorite = useCallback(async (song, e) => {
    e.stopPropagation();
    const vid = song.video_id;
    if (!vid) return;
    const isFav = favoriteIds.has(vid);
    try {
      if (isFav) {
        await axios.delete(getApiUrl(`/api/favorites/${vid}`));
        setFavoriteIds(prev => { const s = new Set(prev); s.delete(vid); return s; });
        setFavorites(prev => prev.filter(f => f.video_id !== vid));
      } else {
        await axios.post(getApiUrl('/api/favorites/add'), {
          video_id: vid,
          title: song.title || '',
          file_path: song.file_path || '',
        });
        setFavoriteIds(prev => new Set([...prev, vid]));
        setFavorites(prev => [{ video_id: vid, title: song.title, file_path: song.file_path, added_at: Date.now() / 1000 }, ...prev]);
      }
    } catch (e) { console.error(e); }
  }, [favoriteIds, getApiUrl]);

  const getArtistName = (song) => {
    if (song.file_path?.includes('/')) return song.file_path.split('/')[0];
    if (song.file_path?.includes('\\')) return song.file_path.split('\\')[0];
    if (song.title?.includes(' - ')) return song.title.split(' - ')[0].trim();
    return t('libraryUnknown') || 'Desconhecido';
  };

  const formatDuration = (secs) => {
    if (!secs) return '--:--';
    const m = Math.floor(secs / 60);
    const s = String(Math.floor(secs % 60)).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleStreamSearch = async () => {
    if (!streamQuery.trim()) return;
    setStreamLoading(true);
    setStreamError('');
    setStreamResults([]);
    try {
      const isPlaylistUrl = streamQuery.includes('/playlist/') ||
                            streamQuery.includes('playlist?list=') ||
                            streamQuery.includes('&list=') ||
                            streamQuery.includes('?list=');
      if (isPlaylistUrl) {
        const res = await axios.post(getApiUrl('/api/stream/playlist'), { url: streamQuery });
        setStreamResults(res.data.entries || []);
        addToStreamHistory(streamQuery);
      } else {
        const res = await axios.post(getApiUrl('/api/stream/resolve'), { query: streamQuery });
        setStreamResults(res.data.entries || [res.data]);
        addToStreamHistory(streamQuery);
      }
    } catch (e) {
      let errStr = 'Erro ao buscar stream.';
      if (e.response?.data?.detail) {
        errStr = typeof e.response.data.detail === 'string' ? e.response.data.detail : JSON.stringify(e.response.data.detail);
      }
      setStreamError(errStr);
    } finally {
      setStreamLoading(false);
    }
  };

  const handleStreamPlay = async (item, queue) => {
    setStreamPlayingId(item.video_id || item.url);
    try {
      // Use the backend proxy so the browser can play without CORS/auth issues
      const videoId = item.video_id;
      const proxyUrl = videoId
        ? getApiUrl(`/api/stream/proxy?video_id=${encodeURIComponent(videoId)}`)
        : getApiUrl(`/api/stream/proxy?url=${encodeURIComponent(item.url)}`);

      onPlaySong({
        title: item.title,
        artist: item.artist,
        url: proxyUrl,
        thumbnail: item.thumbnail,
        video_id: item.video_id,
        isStream: true,
        quality: 'Stream',
      }, queue);
    } catch (e) {
      console.error('Stream play error:', e);
    } finally {
      setStreamPlayingId(null);
    }
  };

  const handleStreamDownload = (item) => {
    if (!item.video_id) return;
    const ytUrl = `https://www.youtube.com/watch?v=${item.video_id}`;
    if (onDownload) {
      onDownload({
        url: ytUrl,
        title: item.title,
        thumbnail: item.thumbnail,
        quality: '192',
        format: 'mp3',
      });
    }
  };

  const renderStreamingTab = () => (
    <div className="flex flex-col gap-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Radio size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={streamQuery}
            onChange={e => setStreamQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStreamSearch()}
            placeholder="Cole um link do YouTube ou pesquise uma música..."
            className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-2xl pl-9 pr-4 py-3 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <button
          onClick={handleStreamSearch}
          disabled={streamLoading}
          className="px-5 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary font-bold rounded-2xl transition-all shadow-md flex items-center gap-2 text-sm"
        >
          {streamLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Buscar
        </button>
      </div>

      {/* Search History Chips */}
      {!streamLoading && streamResults.length === 0 && streamHistory.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          <span className="text-xs text-on-surface-variant flex items-center mr-1">Recentes:</span>
          {streamHistory.map((h, i) => (
            <button
              key={i}
              onClick={() => { setStreamQuery(h); handleStreamSearch(h); }}
              className="px-3 py-1 bg-surface-variant hover:bg-surface-container-highest text-on-surface-variant text-xs rounded-full transition-colors flex items-center gap-1"
            >
              <Clock size={10} /> {h.length > 30 ? h.substring(0, 30) + '...' : h}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {streamError && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm">{streamError}</div>
      )}

      {/* Loading skeleton */}
      {streamLoading && (
        <div className="space-y-2">
          {[1,2,3].map(i => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 animate-pulse">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!streamLoading && streamResults.length > 0 && (
        <div className="space-y-1">
          {streamResults.length > 1 && (
            <div className="flex justify-between items-center px-2 pb-1">
              <p className="text-xs text-on-surface-variant">{streamResults.length} faixas na playlist</p>
              <button
                onClick={() => handleStreamPlay(streamResults[0], streamResults)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-bold transition-colors"
              >
                <Play size={12} fill="currentColor" /> Tocar tudo
              </button>
            </div>
          )}
          {streamResults.map((item, idx) => {
            const isLoading = streamPlayingId === (item.video_id || item.url);
            return (
              <motion.div
                key={item.video_id || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl group transition-all duration-200 cursor-pointer"
                onClick={() => handleStreamPlay(item, streamResults)}
              >
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-14 h-14 bg-black/50 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner">
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity absolute inset-0" onError={e => e.target.style.display='none'} />
                    )}
                    {isLoading
                      ? <Loader2 size={20} className="text-primary animate-spin absolute z-10" />
                      : <Play className="text-white opacity-0 group-hover:opacity-100 transition-opacity absolute z-10 drop-shadow-md" size={22} fill="currentColor" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-white font-medium truncate text-sm tracking-tight">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2">
                      {item.artist}
                      {item.duration > 0 && (
                        <span className="flex items-center gap-1 opacity-60"><Clock size={10} />{formatDuration(item.duration)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">STREAM</span>
                  {item.video_id && (
                    <button
                      onClick={e => { e.stopPropagation(); handleStreamDownload(item); }}
                      className="p-2 rounded-full hover:bg-white/10 text-on-surface-variant hover:text-primary transition-colors"
                      title="Baixar esta música"
                    >
                      <Download size={15} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!streamLoading && streamResults.length === 0 && !streamError && (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
          <Radio size={48} className="opacity-20" />
          <div className="text-center">
            <p className="font-medium">Escute sem baixar</p>
            <p className="text-xs mt-1 max-w-xs opacity-70">Cole um link do YouTube ou pesquise o nome de uma música ou playlist.</p>
          </div>
        </div>
      )}
    </div>
  );

  // ── Discography Tab ──
  const handleArtistSearch = async () => {
    if (!artistQuery.trim()) return;
    setArtistLoading(true);
    setArtistError('');
    setArtistResults([]);
    setArtistName('');
    try {
      const res = await axios.post(getApiUrl('/api/stream/artist'), { artist: artistQuery.trim() });
      setArtistResults(res.data.entries || []);
      setArtistName(res.data.artist || artistQuery);
      addToArtistHistory(artistQuery);
      if (!res.data.entries?.length) setArtistError('Nenhuma música encontrada para este artista.');
    } catch (e) {
      let errStr = 'Erro ao buscar discografia.';
      if (e.response?.data?.detail) {
        errStr = typeof e.response.data.detail === 'string' ? e.response.data.detail : JSON.stringify(e.response.data.detail);
      }
      setArtistError(errStr);
    } finally {
      setArtistLoading(false);
    }
  };

  const handleArtistDownloadAll = () => {
    if (!artistResults.length || !onDownload) return;
    let ok = 0;
    for (const item of artistResults) {
      if (!item.video_id) continue;
      onDownload({
        url: `https://www.youtube.com/watch?v=${item.video_id}`,
        title: item.title,
        thumbnail: item.thumbnail,
        quality: '192',
        format: 'mp3',
      });
      ok++;
    }
    if (ok) setArtistError(`✅ ${ok} músicas adicionadas à fila de download!`);
  };

  const renderDiscographyTab = () => (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Mic2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            value={artistQuery}
            onChange={e => setArtistQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleArtistSearch()}
            placeholder="Nome do artista (ex: The Weeknd, Drake, Adele...)"
            className="w-full bg-surface-container-highest border border-outline-variant/30 rounded-2xl pl-9 pr-4 py-3 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/50 transition-colors"
          />
        </div>
        <button
          onClick={handleArtistSearch}
          disabled={artistLoading}
          className="px-5 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary font-bold rounded-2xl transition-all shadow-md flex items-center gap-2 text-sm"
        >
          {artistLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Buscar
        </button>
      </div>

      {/* Search History Chips */}
      {!artistLoading && artistResults.length === 0 && artistHistory.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          <span className="text-xs text-on-surface-variant flex items-center mr-1">Recentes:</span>
          {artistHistory.map((h, i) => (
            <button
              key={i}
              onClick={() => { 
                setArtistQuery(h); 
                // Need to trigger search immediately with the history value
                setTimeout(() => {
                  setArtistLoading(true);
                  setArtistError('');
                  setArtistResults([]);
                  setArtistName('');
                  axios.post(getApiUrl('/api/stream/artist'), { artist: h })
                    .then(res => {
                      setArtistResults(res.data.entries || []);
                      setArtistName(res.data.artist || h);
                      addToArtistHistory(h);
                    })
                    .catch(e => setArtistError(e.response?.data?.detail || 'Erro ao buscar discografia.'))
                    .finally(() => setArtistLoading(false));
                }, 10);
              }}
              className="px-3 py-1 bg-surface-variant hover:bg-surface-container-highest text-on-surface-variant text-xs rounded-full transition-colors flex items-center gap-1"
            >
              <Clock size={10} /> {h}
            </button>
          ))}
        </div>
      )}

      {/* Error / success message */}
      {artistError && (
        <div className={`p-3 rounded-2xl text-sm border ${
          artistError.startsWith('✅')
            ? 'bg-green-500/10 border-green-500/20 text-green-400'
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>{artistError}</div>
      )}

      {/* Loading */}
      {artistLoading && (
        <div className="space-y-2">
          {[1,2,3,4].map(i => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 animate-pulse">
              <div className="w-14 h-14 bg-white/10 rounded-xl flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-white/10 rounded w-3/4" />
                <div className="h-3 bg-white/10 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {!artistLoading && artistResults.length > 0 && (
        <div className="space-y-1">
          {/* Header bar */}
          <div className="flex items-center justify-between px-2 pb-2 border-b border-white/5">
            <div>
              <h3 className="text-base font-bold text-on-surface">{artistName}</h3>
              <p className="text-xs text-on-surface-variant">{artistResults.length} músicas encontradas</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleStreamPlay(artistResults[0], artistResults)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary font-bold rounded-full transition-colors"
              >
                <Play size={12} fill="currentColor" /> Tocar tudo
              </button>
              <button
                onClick={handleArtistDownloadAll}
                disabled={artistDownloading}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-secondary/20 hover:bg-secondary/30 text-secondary font-bold rounded-full transition-colors disabled:opacity-50"
              >
                {artistDownloading ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Baixar tudo
              </button>
            </div>
          </div>

          {/* Track list */}
          {artistResults.map((item, idx) => {
            const isLoading = streamPlayingId === (item.video_id || item.url);
            return (
              <motion.div
                key={item.video_id || idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.015 }}
                className="flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl group transition-all duration-200 cursor-pointer"
                onClick={() => handleStreamPlay(item, artistResults)}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-xs text-on-surface-variant/40 w-5 text-center flex-shrink-0">{idx + 1}</span>
                  <div className="w-12 h-12 bg-black/50 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner">
                    {item.thumbnail && (
                      <img src={item.thumbnail} alt="" className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity absolute inset-0" onError={e => e.target.style.display='none'} />
                    )}
                    {isLoading
                      ? <Loader2 size={18} className="text-primary animate-spin absolute z-10" />
                      : <Play className="text-white opacity-0 group-hover:opacity-100 transition-opacity absolute z-10 drop-shadow-md" size={18} fill="currentColor" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-white font-medium truncate text-sm tracking-tight">{item.title}</h4>
                    <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2">
                      {item.artist}
                      {item.duration > 0 && (
                        <span className="flex items-center gap-1 opacity-60"><Clock size={10} />{formatDuration(item.duration)}</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {item.video_id && (
                    <button
                      onClick={e => { e.stopPropagation(); handleStreamDownload(item); }}
                      className="p-2 rounded-full hover:bg-white/10 text-on-surface-variant hover:text-primary transition-colors"
                      title="Baixar esta música"
                    >
                      <Download size={14} />
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!artistLoading && artistResults.length === 0 && !artistError && (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
          <Mic2 size={48} className="opacity-20" />
          <div className="text-center">
            <p className="font-medium">Buscar Discografia</p>
            <p className="text-xs mt-1 max-w-xs opacity-70">Digite o nome de um artista para listar todas as suas músicas no YouTube Music.</p>
          </div>
        </div>
      )}
    </div>
  );

  const groupedByArtist = useMemo(() => {
    const groups = {};
    library.forEach(song => {
      const artist = getArtistName(song);
      if (!groups[artist]) groups[artist] = [];
      groups[artist].push(song);
    });
    return groups;
  }, [library]);

  const filteredLibrary = useMemo(() => {
    if (!search) return library;
    return library.filter(s => s.title?.toLowerCase().includes(search.toLowerCase()));
  }, [library, search]);

  const filteredFavorites = useMemo(() => {
    if (!search) return favorites;
    return favorites.filter(s => s.title?.toLowerCase().includes(search.toLowerCase()));
  }, [favorites, search]);

  const renderSongItem = (song, idx, queue) => {
    const isFav = favoriteIds.has(song.video_id);
    return (
      <motion.div
        key={`${song.video_id}-${idx}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: idx * 0.02 }}
        className="flex items-center justify-between p-3 hover:bg-white/5 rounded-2xl group transition-all duration-200 cursor-pointer"
        onClick={() => onPlaySong({ title: song.title, file: song.file_path, quality: 'Local', video_id: song.video_id, thumbnail: song.thumbnail }, queue)}
      >
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="w-14 h-14 bg-black/50 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden shadow-inner group-hover:scale-105 transition-transform">
            {(song.thumbnail || song.video_id) && (
              <img
                src={song.thumbnail || `https://i.ytimg.com/vi/${song.video_id}/0.jpg`}
                alt=""
                className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity absolute inset-0"
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <Play className="text-white opacity-0 group-hover:opacity-100 transition-opacity absolute z-10 drop-shadow-md" size={22} fill="currentColor" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-white font-medium truncate text-sm tracking-tight">{song.title || 'Música Desconhecida'}</h4>
            <p className="text-xs text-on-surface-variant mt-0.5">{getArtistName(song)}</p>
          </div>
        </div>

        {/* Actions - sempre visíveis */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {onEditTags && song.file_path && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditTags(song); }}
              className="p-2 rounded-full hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
              title="Editar Tags"
            >
              <Edit3 size={15} />
            </button>
          )}
          {onTrimAudio && song.file_path && (
            <button
              onClick={(e) => { e.stopPropagation(); onTrimAudio(song); }}
              className="p-2 rounded-full hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
              title="Cortar Áudio"
            >
              <Scissors size={15} />
            </button>
          )}
          <motion.button
            onClick={(e) => toggleFavorite(song, e)}
            whileTap={{ scale: 0.8 }}
            className={`p-2 rounded-full transition-colors ${isFav ? 'text-red-400 hover:bg-red-400/10' : 'text-on-surface-variant hover:bg-white/10 hover:text-red-400'}`}
            title={isFav ? t('libraryRemoveFav') || 'Remover dos Favoritos' : t('libraryAddFav') || 'Adicionar aos Favoritos'}
          >
            <Heart size={15} fill={isFav ? 'currentColor' : 'none'} />
          </motion.button>
        </div>
      </motion.div>
    );
  };

  const renderContent = () => {
    if (loading) return (
      <div className="flex items-center justify-center h-40 text-on-surface-variant">
        <RefreshCw className="animate-spin mr-2" size={20} /> Carregando biblioteca...
      </div>
    );

    if (activeTab === 'all') {
      if (filteredLibrary.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
          <Music size={48} className="opacity-20" />
          <p>{search ? 'Nenhuma música encontrada.' : 'Você ainda não baixou nenhuma música.'}</p>
        </div>
      );
      return <div className="space-y-1">{filteredLibrary.map((s, i) => renderSongItem(s, i, filteredLibrary))}</div>;
    }

    if (activeTab === 'favorites') {
      if (filteredFavorites.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
          <Heart size={48} className="opacity-20" />
          <p>{search ? 'Nenhum favorito encontrado.' : 'Nenhuma música favoritada ainda. Passe o mouse numa música e clique no coração!'}</p>
        </div>
      );
      return <div className="space-y-1">{filteredFavorites.map((s, i) => renderSongItem(s, i, filteredFavorites))}</div>;
    }

    if (activeTab === 'artists') {
      if (selectedArtist) return (
        <div>
          <button onClick={() => setSelectedArtist(null)} className="flex items-center gap-2 text-on-surface-variant hover:text-on-surface mb-4 px-2 transition-colors font-medium">
            <ChevronLeft size={20} /> {t('libraryBackArtists') || 'Voltar para Artistas'}
          </button>
          <h3 className="text-xl font-bold text-on-surface px-2 mb-4">{selectedArtist}</h3>
          <div className="space-y-1">{(groupedByArtist[selectedArtist] || []).map((s, i) => renderSongItem(s, i, groupedByArtist[selectedArtist]))}</div>
        </div>
      );
      return (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-2">
          {Object.entries(groupedByArtist).sort((a, b) => a[0].localeCompare(b[0])).map(([artist, songs]) => {
            const firstVideoId = songs.find(s => s.video_id)?.video_id;
            return (
              <div key={artist} onClick={() => setSelectedArtist(artist)}
                className="flex items-center gap-4 p-4 bg-white/5 hover:bg-white/10 rounded-2xl cursor-pointer transition-all hover:scale-[1.02] border border-white/5 group">
                <div className="w-14 h-14 bg-black/40 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {firstVideoId
                    ? <img src={`https://i.ytimg.com/vi/${firstVideoId}/0.jpg`} alt={artist} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={(e) => { e.target.style.display = 'none'; }} />
                    : <Disc className="text-on-surface-variant" size={24} />}
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-on-surface font-medium truncate text-sm">{artist}</h4>
                  <p className="text-xs text-on-surface-variant">{songs.length} música{songs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
            );
          })}
        </div>
      );
    }

    if (activeTab === 'studio') {
      if (studioLibrary.length === 0) return (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4">
          <Mic size={48} className="opacity-20" />
          <p>Você ainda não processou nenhuma música na IA.</p>
        </div>
      );
      return (
        <div className="space-y-4">
          {studioLibrary.map((item, idx) => (
            <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl p-5 hover:bg-white/10 transition-colors">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-primary/20 text-primary rounded-xl flex items-center justify-center flex-shrink-0"><Mic size={24} /></div>
                <div>
                  <h4 className="text-on-surface font-bold text-lg">{item.track}</h4>
                  <p className="text-xs text-on-surface-variant mt-1">Modelo: {item.model} • {new Date(item.created_at * 1000).toLocaleString()}</p>
                </div>
              </div>
              <div className="space-y-3 pl-16">
                {item.stems.map((stem, sIdx) => (
                  <div key={sIdx} className="bg-black/30 rounded-lg p-3 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-on-surface capitalize">{stem.name.replace('.mp3', '')}</span>
                      <span className="text-xs text-on-surface-variant bg-black/50 px-2 py-1 rounded-md">{stem.size}</span>
                    </div>
                    <audio controls src={getApiUrl(`/downloads/${stem.path}`)} className="w-full h-8" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }
    if (activeTab === 'streaming') return renderStreamingTab();
    if (activeTab === 'discography') return renderDiscographyTab();

    if (activeTab === 'editor') {
      return (
        <div className="flex flex-col items-center justify-center h-64 text-on-surface-variant gap-4 p-8 text-center">
          <Edit3 size={48} className="text-primary opacity-80" />
          <div>
            <h3 className="text-lg font-bold text-on-surface">Editor de Tags Independente</h3>
            <p className="mt-1 max-w-md">Você pode editar os metadados (capa, letra, artista) de qualquer música do seu computador, não apenas as que estão na biblioteca.</p>
          </div>
          <button 
            onClick={async () => {
              try {
                const res = await axios.post(getApiUrl('/api/choose_file'));
                if (res.data.file) {
                  const fileName = res.data.file.split(/[\\/]/).pop();
                  if (onEditTags) onEditTags({ file_path: res.data.file, title: fileName });
                }
              } catch (e) { console.error("Error picking file", e); }
            }}
            className="mt-2 px-6 py-3 bg-primary text-on-primary rounded-full font-bold shadow-lg hover:scale-105 transition-transform"
          >
            Selecionar Música do PC
          </button>
        </div>
      );
    }
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'all', label: t('libraryTabGeneral') || 'Geral', icon: Music, show: true },
    { id: 'favorites', label: t('libraryTabFavorites') || 'Favoritos', icon: Heart, show: true, badge: favorites.length || null },
    { id: 'artists', label: t('libraryTabArtists') || 'Artistas', icon: Users, show: library.length > 0 },
    { id: 'studio', label: 'IA Stems', icon: Mic, show: studioLibrary.length > 0 },
    { id: 'editor', label: t('libraryTabEditor') || 'Editor Tags', icon: Edit3, show: true },
    { id: 'streaming', label: 'Streaming', icon: Radio, show: true },
    { id: 'discography', label: 'Discografia', icon: Mic2, show: true },
  ];

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface-container-high rounded-[28px] w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="p-6 border-b border-surface-container-highest flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary-container rounded-full"><Music className="text-on-primary-container" size={22} /></div>
              <div>
                <h2 className="text-2xl font-bold text-on-surface">{t('libraryTitle') || 'Sua Biblioteca'}</h2>
                <p className="text-sm text-on-surface-variant">{library.length} {t('librarySongsSaved') || 'músicas salvas no seu PC'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="bg-surface-container-highest border border-outline-variant/30 rounded-full pl-8 pr-4 py-2 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/50 w-44"
                />
              </div>
              <button onClick={openFolder} className="flex items-center gap-2 px-4 py-2 bg-surface-variant hover:bg-surface-container-highest text-on-surface-variant rounded-full transition-colors text-sm font-medium">
                <FolderOpen size={16} /><span className="hidden md:inline">{t('openFolder') || 'Abrir Pasta'}</span>
              </button>
              <button onClick={fetchLibrary} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors" title={t('refresh') || 'Atualizar'}>
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="p-2 text-on-surface-variant hover:text-on-surface hover:bg-surface-variant rounded-full transition-colors">
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-container-highest flex-shrink-0 overflow-x-auto">
            {tabs.filter(t => t.show).map(tab => (
              <button key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedArtist(null); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}>
                <tab.icon size={15} fill={tab.id === 'favorites' && activeTab === tab.id ? 'currentColor' : 'none'} />
                {tab.label}
                {tab.badge > 0 && (
                  <span className="ml-1 bg-primary text-on-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {renderContent()}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
