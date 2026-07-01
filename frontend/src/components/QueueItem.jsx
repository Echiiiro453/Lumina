import React from 'react';
import { Play, X, Zap, RotateCcw, CheckCircle2, Clock, AlertCircle, Loader2 } from 'lucide-react';
import { isCompleted, isError } from '../utils/downloadStatus';

export const QueueItem = ({ item, removeFromQueue, setCurrentSong, job, onRetry }) => {
    const displayStatus = job?.status || item.status;
    const displayProgress = job?.progress !== undefined ? job.progress : (item.progress || 0);
    const displayTitle = job?.title || item.title || 'Sem título';
    const error = job?.error || item.error;
    const speed = job?.speed_str;
    const totalBytes = job?.total_bytes_str;
    const downloadedBytes = job?.downloaded_bytes_str;

    const isDownloading = displayStatus === 'downloading' || displayStatus === 'running' || displayStatus === 'processing';
    const isCompletedItem = isCompleted(displayStatus);
    const isErrorItem     = isError(displayStatus);
    const isPending     = displayStatus === 'pending' || displayStatus === 'queued';
    const showProgress  = isDownloading && displayProgress > 0 && displayProgress < 99;

    const getStatusLabel = () => {
        if (isPending && displayStatus === 'queued') return 'Na fila';
        if (isPending)       return 'Aguardando';
        if (isCompletedItem)     return 'Concluído';
        if (isErrorItem)         return displayStatus === 'timeout' ? 'Tempo excedido' : 'Erro';
        if (displayStatus === 'processing') return 'Finalizando...';
        if (isDownloading && displayProgress >= 98) return 'Finalizando...';
        if (isDownloading)   return `${displayProgress.toFixed(0)}%`;
        return displayStatus;
    };

    const statusColor = isCompletedItem ? 'text-green-400'
        : isErrorItem   ? 'text-red-400'
        : isDownloading ? 'text-primary'
        : 'text-on-surface-variant';

    const StatusIcon = isCompletedItem ? CheckCircle2
        : isErrorItem   ? AlertCircle
        : isDownloading ? Loader2
        : Clock;

    return (
        <div className={`relative flex items-center gap-3 p-3 rounded-2xl overflow-hidden transition-all duration-300
            ${isCompletedItem ? 'bg-green-500/5 border border-green-500/15'
            : isErrorItem     ? 'bg-red-500/5 border border-red-500/15'
            : isDownloading ? 'bg-primary/5 border border-primary/20'
            : 'bg-on-surface/[0.03] border border-transparent hover:border-outline-variant/20'}`}
        >
            {/* Progress bar at bottom */}
            {isDownloading && displayProgress > 0 && (
                <div
                    className="absolute bottom-0 left-0 h-[2px] bg-primary/60 transition-all duration-700 ease-out"
                    style={{ width: `${displayProgress}%` }}
                />
            )}

            {/* Thumbnail */}
            <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-surface-container-highest shadow-inner">
                {item.thumbnail
                    ? <img src={item.thumbnail} className="w-full h-full object-cover" alt={displayTitle} onError={e => e.target.style.display = 'none'} />
                    : <div className="w-full h-full flex items-center justify-center text-on-surface-variant/30">
                        <Zap size={20} />
                      </div>
                }
                {/* Speed overlay */}
                {showProgress && speed && (
                    <div className="absolute inset-0 bg-surface-container/85 flex items-center justify-center">
                        <div className="text-center">
                            <Zap size={10} className="text-primary mx-auto mb-0.5" />
                            <span className="text-on-surface text-[9px] font-bold leading-none">{speed}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 flex flex-col gap-1">
                <h4 className="text-on-surface font-medium truncate text-sm leading-tight">{displayTitle}</h4>

                {/* Status row */}
                <div className="flex items-center gap-1.5">
                    <StatusIcon
                        size={11}
                        className={`flex-shrink-0 ${statusColor} ${isDownloading && displayStatus !== 'processing' ? 'animate-spin' : ''}`}
                    />
                    <span className={`text-xs font-medium ${statusColor}`}>{getStatusLabel()}</span>
                    {isErrorItem && error && (
                        <span className="text-[10px] text-red-400/70 truncate">— {error}</span>
                    )}
                </div>

                {/* Speed + size row */}
                {showProgress && (downloadedBytes || totalBytes) && (
                    <div className="flex items-center gap-2 text-[10px] text-on-surface-variant/60">
                        {downloadedBytes && totalBytes && <span>{downloadedBytes} / {totalBytes}</span>}
                        {speed && (
                            <span className="text-primary/70 flex items-center gap-0.5">
                                <Zap size={8} />{speed}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                {/* Play button when completed */}
                {isCompletedItem && setCurrentSong && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const filePath = job?.filename || job?.file_path || item.file_path || item.filename || item.file;
                            setCurrentSong({ title: displayTitle, file: filePath, quality: 'Local', thumbnail: item.thumbnail });
                        }}
                        className="p-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-full transition-all"
                        title="Tocar agora"
                    >
                        <Play size={13} fill="currentColor" />
                    </button>
                )}

                {/* Retry button on error */}
                {isErrorItem && onRetry && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onRetry(item); }}
                        className="p-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded-full transition-all"
                        title="Tentar novamente"
                    >
                        <RotateCcw size={13} />
                    </button>
                )}

                {/* Cancel / Remove button */}
                {!isCompletedItem && (
                    <button
                        onClick={(e) => { e.stopPropagation(); removeFromQueue(item.uniqueId); }}
                        className="p-2 hover:bg-red-500/20 text-on-surface-variant hover:text-red-400 rounded-full transition-all"
                        title={isPending ? 'Remover da fila' : 'Cancelar'}
                    >
                        <X size={14} />
                    </button>
                )}

                {/* Remove completed */}
                {isCompletedItem && (
                    <button
                        onClick={(e) => { e.stopPropagation(); removeFromQueue(item.uniqueId); }}
                        className="p-2 hover:bg-white/10 text-on-surface-variant/40 hover:text-on-surface-variant rounded-full transition-all"
                        title="Remover da lista"
                    >
                        <X size={13} />
                    </button>
                )}
            </div>
        </div>
    );
};
