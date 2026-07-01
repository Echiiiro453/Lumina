import React, { useState, useEffect } from 'react';
import { t } from '../i18n';
import { QRCodeSVG } from 'qrcode.react';
import { Smartphone, X, Wifi, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MobileSyncModal({ isOpen, onClose }) {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [pendingDevice, setPendingDevice] = useState(null);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (prevIsOpen !== isOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setLoading(true);
      setError(null);
    }
  }

  const handleApprove = () => {
    fetch(`http://localhost:8000/api/mobile/token/approve?token=${token}`, { method: 'POST' })
      .then(() => onClose())
      .catch(console.error);
  };

  useEffect(() => {
    if (isOpen) {
      Promise.all([
        fetch('http://localhost:8000/api/network/ip').then(res => res.json()),
        fetch('http://localhost:8000/api/mobile/token/create', { method: 'POST' }).then(res => res.json())
      ])
      .then(([ipData, tokenData]) => {
        setIp(ipData.ip);
        setToken(tokenData.token);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('Não foi possível obter o IP ou token. Verifique se o servidor está em execução.');
        setLoading(false);
      });
    }
  }, [isOpen]);

  useEffect(() => {
    let interval;
    if (isOpen && token && !pendingDevice) {
      interval = setInterval(() => {
        fetch(`http://localhost:8000/api/mobile/token/status?token=${token}`)
          .then(res => res.json())
          .then(data => {
            if (data.device_name) {
              setPendingDevice(data.device_name);
            }
          })
          .catch(console.error);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isOpen, token, pendingDevice]);

  if (!isOpen) return null;

  const url = ip && token ? `http://${ip}:8000/api/mobile?token=${token}` : '';

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-container border border-outline-variant/30 rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-primary/15 rounded-full">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-on-surface">Sincronizar com Celular</h2>
              <p className="text-xs text-on-surface-variant">{t('syncLocalWifi') || 'Acesso via rede local Wi-Fi'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-on-surface/10 rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 flex flex-col items-center justify-center text-center gap-5">
          {loading ? (
            <div className="py-12 text-on-surface-variant">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm">{t('loading') || 'Carregando informações da rede...'}</p>
            </div>
          ) : error ? (
            <div className="py-10 flex flex-col items-center gap-3">
              <AlertCircle className="text-error" size={40} />
              <p className="text-error text-sm font-medium">{error}</p>
            </div>
          ) : (
            <>
              {pendingDevice ? (
                <div className="py-8 px-4 w-full flex flex-col items-center bg-primary/10 border border-primary/20 rounded-2xl">
                  <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center text-primary mb-4">
                    <Smartphone size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-on-surface mb-1">Novo Dispositivo</h3>
                  <p className="text-on-surface-variant text-sm mb-6">
                    <b>{pendingDevice}</b> está tentando se conectar ao PC.
                  </p>
                  <div className="flex gap-3 w-full">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-outline-variant text-on-surface font-semibold hover:bg-surface-variant transition-colors">
                      Recusar
                    </button>
                    <button onClick={handleApprove} className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-bold shadow-lg hover:brightness-110 transition-all">
                      Aprovar Acesso
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* QR Code */}
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <QRCodeSVG
                      value={url}
                      size={192}
                      bgColor="#ffffff"
                      fgColor="#000000"
                      level="Q"
                      includeMargin={false}
                    />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-on-surface">{t('syncScanQR') || 'Escaneie o QR Code'}</h3>
                    <p className="text-on-surface-variant text-sm flex items-center justify-center gap-1.5">
                      <Wifi className="w-4 h-4" />
                      Sessão segura válida por 5 minutos
                    </p>
                  </div>

                  {/* URL manual */}
                  <div className="w-full bg-surface-container-high border border-outline-variant/30 rounded-2xl p-3 text-sm text-on-surface-variant font-mono break-all select-all">
                    {url}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
