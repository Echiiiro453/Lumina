import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { t } from '../i18n';
import { List, X, Trash2, PlayCircle, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { RippleButton } from './Ripple';
import { QueueItem } from './QueueItem';

const QueueDrawer = ({
  showQueue,
  setShowQueue,
  queue,
  setQueue,
  isProcessingQueue,
  processQueue,
  removeFromQueue,
  setCurrentSong,
  updateQueueItem,
  globalJobs,
  getApiUrl
}) => {
  const stats = useMemo(() => ({
    total: queue.length,
    pending: queue.filter(i => i.status === 'pending' || i.status === 'queued').length,
    downloading: queue.filter(i => i.status === 'downloading' || i.status === 'running' || i.status === 'processing').length,
    completed: queue.filter(i => i.status === 'done' || i.status === 'completed').length,
    error: queue.filter(i => i.status === 'error' || i.status === 'timeout').length,
  }), [queue]);

  const clearCompleted = () => {
    setQueue(prev => prev.filter(i => i.status !== 'done' && i.status !== 'completed'));
  };

  const clearAll = () => setQueue([]);

  // Retry: re-add item as pending so processQueue picks it up
  const handleRetry = (item) => {
    updateQueueItem(item.uniqueId, { status: 'pending', progress: 0, error: null });
    if (!isProcessingQueue) processQueue();
  };

  // Group: downloading first, then pending, then error, then completed
  const sortedQueue = useMemo(() => {
    const order = { downloading: 0, running: 0, processing: 0, pending: 1, queued: 1, error: 2, timeout: 2, done: 3, completed: 3 };
    return [...queue].sort((a, b) => {
      const sa = order[a.status] ?? 9;
      const sb = order[b.status] ?? 9;
      return sa - sb;
    });
  }, [queue]);

  const canStart = !isProcessingQueue && stats.pending > 0;

  return (
    <AnimatePresence>
      {showQueue && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowQueue(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 h-full w-full max-w-md bg-surface border-l border-outline-variant z-[101] shadow-[0_0_60px_rgba(0,0,0,0.6)] flex flex-col"
          >
            {/* Header */}
            <div className="p-5 border-b border-outline-variant bg-surface-container-high flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xl font-bold text-on-surface flex items-center gap-2">
                  <List className="text-primary" size={20} />
                  {t('queueTitle') || 'Fila de Downloads'}
                </h3>
                <button
                  onClick={() => setShowQueue(false)}
                  className="p-2 hover:bg-surface-variant text-on-surface-variant rounded-full transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Stats bar */}
              {queue.length > 0 && (
                <div className="flex items-center gap-3 text-xs mb-3">
                  {stats.downloading > 0 && (
                    <span className="flex items-center gap-1 text-primary font-medium">
                      <Loader2 size={11} className="animate-spin" />
                      {stats.downloading} baixando
                    </span>
                  )}
                  {stats.pending > 0 && (
                    <span className="flex items-center gap-1 text-on-surface-variant">
                      <Clock size={11} />
                      {stats.pending} aguardando
                    </span>
                  )}
                  {stats.completed > 0 && (
                    <span className="flex items-center gap-1 text-green-400 font-medium">
                      <CheckCircle2 size={11} />
                      {stats.completed} prontos
                    </span>
                  )}
                  {stats.error > 0 && (
                    <span className="flex items-center gap-1 text-red-400 font-medium">
                      <AlertCircle size={11} />
                      {stats.error} com erro
                    </span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2">
                {stats.completed > 0 && (
                  <button
                    onClick={clearCompleted}
                    className="flex-1 py-1.5 px-3 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-full transition-colors font-medium"
                  >
                    Limpar concluídos ({stats.completed})
                  </button>
                )}
                {queue.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="flex-1 py-1.5 px-3 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center gap-1 rounded-full transition-colors font-medium"
                  >
                    <Trash2 size={11} />
                    Limpar tudo
                  </button>
                )}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
              {queue.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-on-surface-variant/40 gap-3">
                  <List size={48} />
                  <p className="text-sm">{t('queueEmpty') || 'Nenhum download na fila'}</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {sortedQueue.map((item) => (
                    <motion.div
                      key={item.uniqueId}
                      layout
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 40, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                    >
                      <QueueItem
                        item={item}
                        getApiUrl={getApiUrl}
                        removeFromQueue={removeFromQueue}
                        setCurrentSong={setCurrentSong}
                        updateQueueItem={updateQueueItem}
                        onRetry={handleRetry}
                        job={globalJobs?.[item.jobId]}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-outline-variant bg-surface-container-high flex-shrink-0">
              <RippleButton
                id="start-downloads-btn"
                onClick={processQueue}
                disabled={!canStart}
                className={`w-full py-3.5 font-bold rounded-full shadow-lg transition-all flex items-center justify-center gap-2 text-sm
                  ${canStart
                    ? 'bg-primary text-on-primary hover:opacity-90 active:scale-95'
                    : isProcessingQueue && stats.downloading > 0
                      ? 'bg-primary/20 text-primary cursor-default'
                      : 'bg-surface-container-highest text-on-surface-variant/40 cursor-not-allowed'
                  }`}
              >
                {isProcessingQueue && stats.downloading > 0 ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    Baixando {stats.downloading} arquivo{stats.downloading !== 1 ? 's' : ''}...
                  </>
                ) : canStart ? (
                  <>
                    <PlayCircle size={18} />
                    {t('confirmDownload') || 'Iniciar Downloads'} ({stats.pending})
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={18} />
                    Todos concluídos
                  </>
                )}
              </RippleButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default QueueDrawer;
