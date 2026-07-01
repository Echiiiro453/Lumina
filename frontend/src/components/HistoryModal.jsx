import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, CheckCircle, AlertCircle, Trash2, Download, RotateCcw, FolderOpen, Search } from 'lucide-react';
import axios from 'axios';

export function HistoryModal({ isOpen, onClose, apiUrl, onRedownload }) {
    const [history, setHistory] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all'); // 'all' | 'downloaded' | 'missing' | 'error'

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${apiUrl}/api/history?limit=200`);
            setHistory(res.data.history || []);
            setTotal(res.data.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchHistory();
    }, [isOpen]);

    const handleDelete = async (video_id) => {
        try {
            await axios.delete(`${apiUrl}/api/history/${video_id}`);
            setHistory(prev => prev.filter(h => h.video_id !== video_id));
        } catch (e) {
            console.error(e);
        }
    };

    const handleOpenFolder = async (file_path) => {
        try {
            await axios.post(`${apiUrl}/api/open_external`, { file_path });
        } catch (e) { console.error(e); }
    };

    const filtered = history.filter(item => {
        const matchSearch = !search || item.title?.toLowerCase().includes(search.toLowerCase());
        const matchFilter = filter === 'all' || item.status === filter;
        return matchSearch && matchFilter;
    });

    const formatDate = (ts) => {
        if (!ts) return '—';
        return new Date(ts * 1000).toLocaleDateString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getStatusIcon = (status) => {
        if (status === 'downloaded') return <CheckCircle size={13} className="text-green-400 flex-shrink-0" />;
        if (status === 'missing') return <AlertCircle size={13} className="text-yellow-400 flex-shrink-0" />;
        return <AlertCircle size={13} className="text-red-400 flex-shrink-0" />;
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="bg-surface-container border border-outline-variant/30 rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '85vh' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-outline-variant/30">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-primary/15 rounded-xl">
                            <Clock className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-on-surface">Histórico de Downloads</h2>
                            <p className="text-xs text-on-surface-variant">{total} itens no banco de dados</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-on-surface/10 rounded-xl transition-colors text-on-surface-variant hover:text-on-surface">
                        <X size={18} />
                    </button>
                </div>

                {/* Filters + Search */}
                <div className="p-4 border-b border-outline-variant/30 flex items-center gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-[160px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar no histórico..."
                            className="w-full bg-surface-container-high border border-outline-variant/30 rounded-xl pl-8 pr-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:border-primary/50"
                        />
                    </div>
                    <div className="flex gap-1">
                        {[['all', 'Todos'], ['downloaded', '✅ OK'], ['missing', '⚠️ Ausente'], ['error', '❌ Erro']].map(([val, label]) => (
                            <button
                                key={val}
                                onClick={() => setFilter(val)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === val ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scroll">
                    {loading ? (
                        <div className="flex items-center justify-center py-16">
                            <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant gap-3">
                            <Clock size={40} className="opacity-20" />
                            <p className="text-sm">Nenhum item encontrado</p>
                        </div>
                    ) : filtered.map((item) => (
                        <motion.div
                            key={item.video_id || item.title}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 p-3 bg-surface-container-low hover:bg-surface-container-high rounded-xl border border-outline-variant/30 group transition-all"
                        >
                            {getStatusIcon(item.status)}

                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-on-surface truncate font-medium">{item.title || 'Sem título'}</p>
                                <p className="text-[10px] text-on-surface-variant mt-0.5">{formatDate(item.created_at)}</p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {item.url && onRedownload && (
                                    <button
                                        onClick={() => { onRedownload(item.url); onClose(); }}
                                        title="Re-baixar"
                                        className="p-1.5 rounded-lg bg-primary/20 hover:bg-primary/40 text-primary transition-colors"
                                    >
                                        <RotateCcw size={13} />
                                    </button>
                                )}
                                {item.file_path && item.status === 'downloaded' && (
                                    <button
                                        onClick={() => handleOpenFolder(item.file_path)}
                                        title="Abrir no Explorer"
                                        className="p-1.5 rounded-lg bg-surface-container-highest hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface transition-colors"
                                    >
                                        <FolderOpen size={13} />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDelete(item.video_id)}
                                    title="Remover do histórico"
                                    className="p-1.5 rounded-lg bg-error-container hover:bg-error-container/80 text-on-error-container transition-colors"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-outline-variant/30 flex justify-between items-center">
                    <span className="text-xs text-on-surface-variant">{filtered.length} itens exibidos</span>
                    <button
                        onClick={fetchHistory}
                        className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
                    >
                        <RotateCcw size={12} />
                        Atualizar
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
