import React, { useState, useMemo } from 'react';
import { t } from '../i18n';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, AlertTriangle, ListPlus } from 'lucide-react';
import { RippleButton } from './Ripple';

const BatchDownloadModal = ({
  isOpen,
  onClose,
  onConfirm
}) => {
  const [text, setText] = useState('');

  // Extract lines and filter empty/whitespace-only lines
  const urls = useMemo(() => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
  }, [text]);

  // Check if any URL belongs to Spotify/Apple Music/SoundCloud
  const hasIncompatibleLinks = useMemo(() => {
    return urls.some(url => {
      const lower = url.toLowerCase();
      return lower.includes('spotify.com') || 
             lower.includes('music.apple.com') || 
             lower.includes('soundcloud.com');
    });
  }, [urls]);

  const handleConfirm = () => {
    if (urls.length === 0) return;
    onConfirm(urls);
    setText('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-xl bg-surface-container border border-outline-variant/30 shadow-2xl rounded-[2rem] p-6 flex flex-col relative overflow-hidden"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-5 relative z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-on-primary-container">
                  <ListPlus size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-on-surface tracking-tight">
                    {t('batchDownloadTitle') || 'Downloads em Lote'}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {t('batchDownloadDesc') || 'Cole um ou mais links (um por linha) para iniciar downloads.'}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 text-on-surface-variant hover:text-on-surface bg-surface-container-high hover:bg-surface-variant rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Input area */}
            <div className="relative z-10 space-y-4">
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('batchDownloadPlaceholder') || 'Cole os links aqui...\nhttps://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=...'}
                  className="w-full h-64 p-4 bg-surface-container-low border border-outline-variant/50 rounded-2xl focus:outline-none focus:border-primary text-on-surface placeholder:text-on-surface-variant/40 transition-all font-mono text-sm resize-none custom-scrollbar"
                  autoFocus
                />
                
                {/* Lines counter */}
                {urls.length > 0 && (
                  <div className="absolute bottom-3 right-4 bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold border border-primary/20">
                    {urls.length} link{urls.length !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              {/* Warnings */}
              {hasIncompatibleLinks && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-start gap-2.5"
                >
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>
                    {t('batchDownloadWarning') || 'Aviso: Links do Spotify, Apple Music ou SoundCloud devem ser importados usando a aba de importação de playlist.'}
                  </span>
                </motion.div>
              )}

              {/* Actions */}
              <div className="flex gap-3 mt-4">
                <RippleButton
                  onClick={onClose}
                  className="flex-1 h-12 rounded-xl border border-outline-variant/50 text-on-surface hover:bg-surface-container-high font-medium transition-all"
                >
                  {t('cancel') || 'Cancelar'}
                </RippleButton>
                
                <RippleButton
                  onClick={handleConfirm}
                  disabled={urls.length === 0}
                  className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/95 disabled:bg-surface-container-highest disabled:text-on-surface-variant/40 text-on-primary font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Download size={18} />
                  <span>{t('batchDownloadAdd') || 'Adicionar à Fila'}</span>
                </RippleButton>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default BatchDownloadModal;
