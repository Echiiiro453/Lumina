import React, { useState, useEffect } from 'react';
import { t } from '../i18n';
import { motion } from 'framer-motion';
import { X, Trash2, ExternalLink, BellRing, AlertCircle } from 'lucide-react';

export function SubscriptionsModal({ isOpen, onClose }) {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);
  const [expandedSubId, setExpandedSubId] = useState(null);
  const [subDownloads, setSubDownloads] = useState({});
  const [loadingDownloads, setLoadingDownloads] = useState(false);

  const fetchSubs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subscriptions');
      const data = await res.json();
      setSubs(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!isOpen) return;

    const timeoutId = setTimeout(fetchSubs, 0);
    return () => clearTimeout(timeoutId);
  }, [isOpen]);

  const removeSub = async (id) => {
    setRemovingId(id);
    try {
      await fetch('/api/subscriptions/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playlist_id: id })
      });
      fetchSubs();
    } catch (e) {
      console.error(e);
    }
    setRemovingId(null);
  };

  const toggleExpand = async (id) => {
    if (expandedSubId === id) {
      setExpandedSubId(null);
      return;
    }
    setExpandedSubId(id);
    if (!subDownloads[id]) {
      setLoadingDownloads(true);
      try {
        const res = await fetch(`/api/subscriptions/${encodeURIComponent(id)}/downloads`);
        const data = await res.json();
        setSubDownloads(prev => ({ ...prev, [id]: data }));
      } catch (e) {
        console.error(e);
      }
      setLoadingDownloads(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container backdrop-blur-2xl rounded-[2rem] shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden border border-outline-variant/30 flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/30 flex-shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/15 rounded-full">
              <BellRing className="text-primary" size={22} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-on-surface">Minhas Inscricoes</h3>
              <p className="text-on-surface-variant text-sm">Playlists com monitoramento automatico</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-on-surface/10 rounded-full transition-colors">
            <X className="text-on-surface-variant" size={22} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="text-center py-12">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-on-surface-variant text-sm">{t('loading') || 'Carregando...'}</p>
            </div>
          ) : subs.length === 0 ? (
            <div className="text-center py-14 flex flex-col items-center gap-4">
              <div className="p-5 bg-surface-container-high rounded-full">
                <BellRing className="text-outline-variant" size={40} />
              </div>
              <div>
                <h4 className="text-base font-semibold text-on-surface mb-1">Nenhuma inscricao ativa</h4>
                <p className="text-on-surface-variant text-sm max-w-xs mx-auto">
                  Abra uma playlist e clique no icone de sino ao lado do titulo para monitorar automaticamente.
                </p>
              </div>
            </div>
          ) : (
            subs.map((sub) => (
              <motion.div
                key={sub.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col p-4 bg-surface-container-high rounded-2xl border border-outline-variant/20 hover:border-outline-variant/50 transition-all cursor-pointer"
                onClick={() => toggleExpand(sub.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0 pr-4">
                    <h4 className="text-on-surface font-semibold truncate mb-1">{sub.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-on-surface-variant flex-wrap">
                      <span className="px-2 py-0.5 bg-primary/15 text-primary rounded-full uppercase tracking-wider font-medium">
                        {sub.platform}
                      </span>
                      <span>Ultima checagem: {sub.last_checked ? new Date(sub.last_checked * 1000).toLocaleString('pt-BR') : 'Nunca'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <a
                      href={sub.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 hover:bg-on-surface/10 text-on-surface-variant hover:text-on-surface rounded-full transition-colors"
                      title="Abrir playlist"
                    >
                      <ExternalLink size={16} />
                    </a>
                    <button
                      onClick={() => removeSub(sub.id)}
                      disabled={removingId === sub.id}
                      className="p-2 hover:bg-error/15 text-on-surface-variant hover:text-error rounded-full transition-colors disabled:opacity-50"
                      title="Remover inscricao"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                
                {/* Expanded Downloads List */}
                {expandedSubId === sub.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 pt-4 border-t border-outline-variant/20"
                    onClick={e => e.stopPropagation()}
                  >
                    <h5 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">Historico de Downloads</h5>
                    {loadingDownloads && !subDownloads[sub.id] ? (
                      <p className="text-xs text-on-surface-variant">{t('loading') || 'Carregando...'}</p>
                    ) : subDownloads[sub.id]?.length > 0 ? (
                      <ul className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                        {subDownloads[sub.id].map(d => (
                          <li key={d.video_id} className="flex items-center justify-between gap-3 text-sm bg-surface-container p-2 rounded-xl border border-outline-variant/10">
                            <span className="text-on-surface truncate flex-1">{d.title}</span>
                            <span className="text-xs text-on-surface-variant flex-shrink-0">
                              {new Date(d.created_at * 1000).toLocaleDateString('pt-BR')}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-on-surface-variant italic">Nenhuma musica baixada desta inscricao ainda.</p>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ))
          )}
        </div>

        {/* Footer info */}
        {subs.length > 0 && (
          <div className="px-6 py-4 border-t border-outline-variant/20 bg-surface-container/50 flex-shrink-0">
            <p className="text-xs text-on-surface-variant text-center">
              O Lumina verifica novidades automaticamente a cada 4 horas.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
