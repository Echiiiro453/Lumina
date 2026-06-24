import React, { useState, useEffect, useRef } from 'react';
import { t } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Search, Music, User, Disc, Calendar, FileText, Image, Loader2, CheckCircle, AlertCircle, FolderOpen } from 'lucide-react';
import axios from 'axios';

export function TagEditorModal({ isOpen, onClose, song, getApiUrl, onSaved }) {
  const [fields, setFields] = useState({ title: '', artist: '', album: '', year: '', lyrics: '' });
  const [coverBase64, setCoverBase64] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fetchingLyrics, setFetchingLyrics] = useState(false);
  const [isCustomSearch, setIsCustomSearch] = useState(false);
  const [customQuery, setCustomQuery] = useState('');
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen && song?.file_path) {
      loadTags();
    }
  }, [isOpen, song]);

  const loadTags = async () => {
    setLoading(true);
    setStatus(null);
    setCoverBase64(null);
    setCoverPreview(null);
    try {
      const res = await axios.get(getApiUrl(`/api/tags/read`), {
        params: { file_path: song.file_path }
      });
      const d = res.data;
      setFields({
        title:  d.title  || song.title || '',
        artist: d.artist || '',
        album:  d.album  || '',
        year:   d.year   || '',
        lyrics: d.lyrics || '',
      });
      if (d.cover_base64) {
        setCoverBase64(d.cover_base64);
        setCoverPreview(`data:image/jpeg;base64,${d.cover_base64}`);
      }
    } catch {
      setStatus({ type: 'error', msg: 'Falha ao carregar tags do arquivo.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      // Extrai apenas o base64 puro (sem o prefixo data:image/...;base64,)
      const b64 = dataUrl.split(',')[1];
      setCoverBase64(b64);
      setCoverPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleFetchLyrics = async (overrideQuery = null) => {
    setFetchingLyrics(true);
    setStatus(null);
    try {
      const payload = overrideQuery 
        ? { file_path: song.file_path, title: overrideQuery, artist: '' }
        : { file_path: song.file_path, title: fields.title, artist: fields.artist };
        
      const res = await axios.post(getApiUrl(`/api/tags/fetch_lyrics`), payload);
      if (res.data.success && res.data.lyrics) {
        setFields(prev => ({ ...prev, lyrics: res.data.lyrics }));
        setStatus({ type: 'success', msg: 'Letra encontrada e atualizada!' });
        setIsCustomSearch(false);
      } else {
        setStatus({ type: 'error', msg: res.data.message || 'Letra nao encontrada.' });
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Erro ao buscar letra na internet.' });
    } finally {
      setFetchingLyrics(false);
    }
  };

  const handleImportLrc = async () => {
    try {
      const res = await axios.post(getApiUrl('/api/choose_lrc_file'));
      if (res.data.content) {
        setFields(prev => ({ ...prev, lyrics: res.data.content }));
        setStatus({ type: 'success', msg: `Letra importada de: ${res.data.file.split(/[\\/]/).pop()}` });
      } else if (res.data.file) {
        setStatus({ type: 'error', msg: 'O arquivo selecionado está vazio ou não pôde ser lido.' });
      }
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Erro ao importar arquivo.' });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const payload = { file_path: song.file_path, ...fields };
      if (coverBase64) payload.cover_base64 = coverBase64;
      const res = await axios.post(getApiUrl(`/api/tags/save`), payload);
      if (res.data.success) {
        setStatus({ type: 'success', msg: 'Tags salvas com sucesso!' });
        if (res.data.new_path) {
          song.file_path = res.data.new_path;
        }
        onSaved?.();
      } else {
        setStatus({ type: 'error', msg: res.data.error || 'Falha ao salvar.' });
      }
    } catch {
      setStatus({ type: 'error', msg: 'Erro ao salvar tags.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const inputClass = "w-full bg-surface-container-highest border border-outline-variant/30 rounded-xl px-4 py-2.5 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/60 transition-colors";

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-surface-container border border-outline-variant/30 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/15 rounded-xl">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Editor de Tags</h2>
              <p className="text-xs text-on-surface-variant truncate max-w-xs">{song?.title || song?.file_path}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-on-surface/10 rounded-xl transition-colors text-on-surface-variant">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scroll">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-primary" size={32} />
            </div>
          ) : (
            <>
              {/* Capa + campos principais */}
              <div className="flex gap-5">
                {/* Cover */}
                <div className="flex-shrink-0">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-32 h-32 rounded-2xl overflow-hidden bg-surface-container-highest border border-outline-variant/30 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity relative group"
                  >
                    {coverPreview
                      ? <img src={coverPreview} alt="Capa" className="w-full h-full object-cover" />
                      : <Music className="text-on-surface-variant opacity-30" size={36} />}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Image size={24} className="text-white" />
                    </div>
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                  <p className="text-[10px] text-on-surface-variant text-center mt-1.5">Clique para trocar</p>
                </div>

                {/* Title + Artist + Album + Year */}
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Music size={11} /> Titulo
                    </label>
                    <input className={inputClass} value={fields.title} onChange={e => setFields(p => ({ ...p, title: e.target.value }))} placeholder="Titulo da musica" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <User size={11} /> Artista
                    </label>
                    <input className={inputClass} value={fields.artist} onChange={e => setFields(p => ({ ...p, artist: e.target.value }))} placeholder="Nome do artista" />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Disc size={11} /> Album
                      </label>
                      <input className={inputClass} value={fields.album} onChange={e => setFields(p => ({ ...p, album: e.target.value }))} placeholder="Nome do album" />
                    </div>
                    <div className="w-24">
                      <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                        <Calendar size={11} /> Ano
                      </label>
                      <input className={inputClass} value={fields.year} onChange={e => setFields(p => ({ ...p, year: e.target.value }))} placeholder="2024" maxLength={4} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Lyrics */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                    <FileText size={11} /> Letra da Musica
                  </label>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleImportLrc}
                        className="flex items-center gap-1.5 text-xs bg-surface-variant hover:bg-surface-container-highest text-on-surface-variant px-3 py-1.5 rounded-full transition-colors font-medium"
                      >
                        <FolderOpen size={12} /> {t('importLrc') || 'Importar .lrc'}
                      </button>
                      <button
                        onClick={() => {
                          if (isCustomSearch) {
                            setIsCustomSearch(false);
                          } else {
                            setCustomQuery(`${fields.title} ${fields.artist}`.trim());
                            setIsCustomSearch(true);
                          }
                        }}
                        className="flex items-center gap-1.5 text-xs bg-surface-variant hover:bg-surface-container-highest text-on-surface-variant px-3 py-1.5 rounded-full transition-colors font-medium"
                        title="Busca Personalizada"
                      >
                        {isCustomSearch ? <X size={12} /> : <Search size={12} />} {isCustomSearch ? "Cancelar" : "Busca Avançada"}
                      </button>
                      {!isCustomSearch && (
                        <button
                          onClick={() => handleFetchLyrics()}
                          disabled={fetchingLyrics || !fields.title}
                          className="flex items-center gap-1.5 text-xs bg-primary/10 hover:bg-primary/20 text-primary px-3 py-1.5 rounded-full transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {fetchingLyrics
                            ? <><Loader2 size={12} className="animate-spin" /> Buscando...</>
                            : <><Search size={12} /> Auto</>}
                        </button>
                      )}
                    </div>
                    
                    {/* Custom Search Input */}
                    <AnimatePresence>
                      {isCustomSearch && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="flex items-center gap-2 w-full overflow-hidden"
                        >
                          <input 
                            className={`${inputClass} flex-1 text-xs py-1.5`} 
                            value={customQuery}
                            onChange={(e) => setCustomQuery(e.target.value)}
                            placeholder="Nome da música e artista..."
                            onKeyDown={(e) => e.key === 'Enter' && handleFetchLyrics(customQuery)}
                            autoFocus
                          />
                          <button
                            onClick={() => handleFetchLyrics(customQuery)}
                            disabled={fetchingLyrics || !customQuery}
                            className="bg-primary text-on-primary px-4 py-1.5 rounded-full text-xs font-bold hover:scale-105 transition-transform disabled:opacity-50"
                          >
                            {fetchingLyrics ? "Buscando..." : "Buscar"}
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <textarea
                  className={`${inputClass} resize-none font-mono text-xs`}
                  rows={10}
                  value={fields.lyrics}
                  onChange={e => setFields(p => ({ ...p, lyrics: e.target.value }))}
                  placeholder="Cole a letra aqui ou use o botao acima para buscar automaticamente..."
                />
              </div>

              {/* Status message */}
              <AnimatePresence>
                {status && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl text-sm font-medium ${status.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-error-container text-on-error-container border border-error/20'}`}
                  >
                    {status.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                    {status.msg}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-outline-variant/30 flex justify-end gap-3 flex-shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full text-sm font-medium text-on-surface-variant hover:bg-on-surface/10 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-on-primary rounded-full text-sm font-bold transition-all shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? (t('saving') || 'Salvando...') : (t('saveTags') || 'Salvar Tags')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
