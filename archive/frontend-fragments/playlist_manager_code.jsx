// ==========================================
// PLAYLIST MANAGER FUNCTIONS
// Add these functions to App.jsx after the auth check functions
// ==========================================

// Buscar detalhes completos da playlist
const fetchPlaylistDetails = async () => {
    if (!metadata?.is_playlist) return;

    setPlaylistLoading(true);
    try {
        const res = await axios.post('http://localhost:8000/playlist/details', {
            url: resolvedUrl || url
        });

        setPlaylistVideos(res.data.videos);
        setShowPlaylistModal(true);

        // Selecionar todos por padrão
        const allIndices = new Set(res.data.videos.map(v => v.index));
        setSelectedVideos(allIndices);
    } catch (error) {
        console.error('Erro ao buscar playlist:', error);
        setMessage('Erro ao carregar detalhes da playlist');
        setStatus('error');
    } finally {
        setPlaylistLoading(false);
    }
};

// Toggle seleção de um vídeo
const toggleVideoSelection = (index) => {
    const newSelected = new Set(selectedVideos);
    if (newSelected.has(index)) {
        newSelected.delete(index);
    } else {
        newSelected.add(index);
    }
    setSelectedVideos(newSelected);
};

// Selecionar todos
const selectAllVideos = () => {
    const allIndices = new Set(playlistVideos.map(v => v.index));
    setSelectedVideos(allIndices);
};

// Limpar seleção
const deselectAllVideos = () => {
    setSelectedVideos(new Set());
};

// Download de vídeos selecionados
const downloadSelectedVideos = async () => {
    if (selectedVideos.size === 0) {
        alert('Selecione pelo menos um vídeo');
        return;
    }

    setShowPlaylistModal(false);
    setStep('downloading');
    setLoading(true);

    try {
        // Preparar request com índices selecionados
        const downloadRequest = {
            url: resolvedUrl || url,
            quality,
            format: mode === 'video' ? quality : (quality === 'flac' ? 'flac' : 'mp3'),
            mode,
            playlist: true,
            playlist_items: Array.from(selectedVideos), // Lista de índices
            start_time: trim ? startTime : null,
            end_time: trim ? endTime : null,
            pitch,
            speed,
            eq_preset: eqPreset,
            title: editTitle || null,
            artist: editArtist || null,
            cover_path: coverPath || null
        };

        const res = await axios.post('http://localhost:8000/download', downloadRequest, {
            onDownloadProgress: (progressEvent) => {
                // Aqui você pode adicionar lógica de progresso mais tarde
            }
        });

        if (res.data.status === 'success') {
            setStatus('success');
            setMessage(`Download concluído! ${selectedVideos.size} música(s) baixada(s)`);
            setDownloadInfo(res.data);
            setStep('result');
        }
    } catch (error) {
        setStatus('error');
        const errorMsg = error.response?.data?.detail || 'Erro ao baixar músicas';
        setMessage(errorMsg);
        setStep('result');
    } finally {
        setLoading(false);
    }
};

// ==========================================
// PLAYLIST MANAGER UI - Modal Component
// Add this before the final return statement in App.jsx
// ==========================================

{/* Playlist Manager Modal */ }
{
    showPlaylistModal && (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
            onClick={() => setShowPlaylistModal(false)}
        >
            <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full max-h-[85vh] overflow-hidden border border-purple-500/20"
            >
                {/* Header */}
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-purple-600/20 to-pink-600/20">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-2xl font-bold text-white mb-1">
                                📋 Selecionar Músicas
                            </h3>
                            <p className="text-gray-300 text-sm">
                                {metadata?.title}
                            </p>
                        </div>
                        <button
                            onClick={() => setShowPlaylistModal(false)}
                            className="p-2 hover:bg-white/10 rounded-full transition-colors"
                        >
                            <X className="text-gray-300" size={24} />
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-4 mt-4">
                        <span className="text-lg font-semibold text-purple-300">
                            {selectedVideos.size} de {playlistVideos.length} selecionadas
                        </span>
                        <button
                            onClick={selectAllVideos}
                            className="px-4 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            Selecionar Todas
                        </button>
                        <button
                            onClick={deselectAllVideos}
                            className="px-4 py-2 bg-gray-600/30 hover:bg-gray-600/50 text-gray-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            Limpar Seleção
                        </button>
                    </div>
                </div>

                {/* Video List */}
                <div className="p-4 overflow-y-auto max-h-[50vh] space-y-2">
                    {playlistVideos.map((video, idx) => (
                        <div
                            key={video.index}
                            onClick={() => toggleVideoSelection(video.index)}
                            className={`flex items-center gap-4 p-3 rounded-xl cursor-pointer transition-all ${selectedVideos.has(video.index)
                                    ? 'bg-purple-600/30 border-2 border-purple-500'
                                    : 'bg-white/5 border-2 border-transparent hover:bg-white/10'
                                }`}
                        >
                            {/* Checkbox */}
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${selectedVideos.has(video.index)
                                    ? 'bg-purple-600 border-purple-600'
                                    : 'border-gray-400'
                                }`}>
                                {selectedVideos.has(video.index) && (
                                    <Check size={14} className="text-white" />
                                )}
                            </div>

                            {/* Thumbnail */}
                            <img
                                src={video.thumbnail}
                                alt={video.title}
                                className="w-24 h-16 object-cover rounded-lg flex-shrink- 0"
                            />

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-medium truncate">
                                    {video.title}
                                </h4>
                                <div className="text-gray-400 text-sm flex items-center gap-2">
                                    <span>{video.uploader}</span>
                                    <span>•</span>
                                    <span>{video.duration_string}</span>
                                </div>
                            </div>

                            {/* Index */}
                            <div className="text-gray-500 text-sm font-mono flex-shrink-0">
                                #{video.index + 1}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-white/10 bg-gradient-to-r from-purple-600/10 to-pink-600/10">
                    <button
                        onClick={downloadSelectedVideos}
                        disabled={selectedVideos.size === 0}
                        className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg"
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Download size={20} />
                            <span>Baixar {selectedVideos.size} Música{selectedVideos.size !== 1 ? 's' : ''}</span>
                        </div>
                    </button>
                </div>
            </motion.div>
        </motion.div>
    )
}

// ==========================================
// UI BUTTON TO OPEN PLAYLIST MODAL
// Add this button in the confirm step where is_playlist is true
// ==========================================

{
    metadata.is_playlist && (
        <button
            onClick={fetchPlaylistDetails}
            disabled={playlistLoading}
            className="mt-4 w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
        >
            {playlistLoading ? (
                <>Carregando playlist...</>
            ) : (
                <>
                    <FileText size={20} />
                    Ver e Selecionar Músicas ({metadata.total_videos || '?'} vídeos)
                </>
            )}
        </button>
    )
}
