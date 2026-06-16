import React, { useEffect, useRef, useState } from 'react';
import { Scissors, X, Save, Loader2, Play, Pause } from 'lucide-react';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';
import axios from 'axios';

export const AudioTrimmerModal = ({ isOpen, onClose, song, getApiUrl, onSaved }) => {
  const containerRef = useRef(null);
  const wavesurferRef = useRef(null);
  const wsRegionsRef = useRef(null);
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [region, setRegion] = useState({ start: 0, end: 0 });
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (!isOpen || !song) return;
    
    setLoading(true);
    let audioUrl = '';
    if (song.file_path) {
      const urlPath = song.file_path.split(/[\\/]/).map(encodeURIComponent).join('/');
      audioUrl = getApiUrl(`/downloads/${urlPath}?t=${Date.now()}`);
    } else if (song.video_id) {
      audioUrl = getApiUrl(`/stream/${song.video_id}?t=${Date.now()}`);
    }

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#A8C7FA',
      progressColor: '#0A56D1',
      cursorColor: '#0A56D1',
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 100,
      url: audioUrl,
    });

    const wsRegions = ws.registerPlugin(RegionsPlugin.create());

    ws.on('ready', () => {
      setLoading(false);
      setDuration(ws.getDuration());
      
      // Criar região inicial cobrindo toda a música
      wsRegions.addRegion({
        start: 0,
        end: ws.getDuration(),
        color: 'rgba(10, 86, 209, 0.1)',
        drag: true,
        resize: true,
      });
    });

    wsRegions.on('region-updated', (r) => {
      setRegion({ start: r.start, end: r.end });
    });

    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    wavesurferRef.current = ws;
    wsRegionsRef.current = wsRegions;

    return () => {
      ws.destroy();
    };
  }, [isOpen, song?.video_id, song?.file_path]);

  const handleSave = async () => {
    if (!region.end) return;
    setSaving(true);
    try {
      await axios.post(getApiUrl('/api/trim_audio'), {
        file_path: song.file_path,
        start_ms: Math.floor(region.start * 1000),
        end_ms: Math.floor(region.end * 1000)
      });
      if (onSaved) onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      alert('Erro ao cortar áudio.');
    } finally {
      setSaving(false);
    }
  };

  const togglePlay = () => {
    if (wavesurferRef.current) {
      wavesurferRef.current.playPause();
    }
  };

  if (!isOpen) return null;

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div 
        className="w-full max-w-2xl bg-surface rounded-3xl overflow-hidden shadow-2xl border border-outline-variant/30 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Scissors size={20} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-on-surface">Cortar Áudio</h2>
                <p className="text-sm text-on-surface-variant line-clamp-1">{song?.title}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors">
              <X size={20} />
            </button>
          </div>

          <div className="bg-surface-container-highest rounded-2xl p-6 relative">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container-highest/80 z-10 rounded-2xl">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            )}
            <div ref={containerRef} className="w-full" />
            
            <div className="flex justify-between items-center mt-4 text-xs font-mono text-on-surface-variant">
              <span>{formatTime(region.start || 0)}</span>
              <span>{formatTime((region.end || duration) - (region.start || 0))} selecionado</span>
              <span>{formatTime(region.end || duration)}</span>
            </div>
          </div>

          <div className="mt-6 flex justify-between items-center">
            <button
              onClick={togglePlay}
              className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center hover:scale-105 transition-transform shadow-md"
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
            </button>

            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-6 py-3 bg-primary text-on-primary rounded-full font-bold shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
            >
              {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
              {saving ? 'Cortando...' : 'Salvar Corte'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
