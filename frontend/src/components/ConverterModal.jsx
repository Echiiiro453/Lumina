import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRightLeft, FileAudio, CheckCircle, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import axios from 'axios';
import { t } from '../i18n';

export function ConverterModal({ isOpen, onClose, apiUrl }) {
  const [inputFile, setInputFile] = useState('');
  const [outputFormat, setOutputFormat] = useState('mp3');
  const [isConverting, setIsConverting] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [outputPath, setOutputPath] = useState(null);

  if (!isOpen) return null;

  const handleOpenFile = () => {
    if (outputPath) {
      axios.post(`${apiUrl}/api/open_external`, { file_path: outputPath }).catch(console.error);
    }
  };

  const handleChooseFile = async () => {
    try {
      const res = await axios.post(`${apiUrl}/api/choose_file`);
      if (res.data.status === 'ok') {
        setInputFile(res.data.file);
        setStatus(null);
        setMessage('');
      } else {
        alert(res.data.message || 'Erro ao selecionar arquivo');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao conectar com servidor.');
    }
  };

  const handleConvert = async () => {
    if (!inputFile) return;
    setIsConverting(true);
    setStatus(null);
    setMessage('');
    setOutputPath(null);

    try {
      const res = await axios.post(`${apiUrl}/api/convert`, {
        input_path: inputFile,
        output_format: outputFormat
      });

      if (res.data.status === 'success') {
        setStatus('success');
        setMessage(`Conversão concluída com sucesso!`);
        setOutputPath(res.data.output_path);
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
      setMessage(e.response?.data?.detail || (t('converterUnknownError') || 'Erro desconhecido na conversão.'));
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-surface-container border border-outline-variant/30 rounded-3xl w-full max-w-md p-6 shadow-2xl relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/10 bg-surface-container rounded-full w-8 h-8 flex items-center justify-center transition-colors z-10"
        >
          X
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary-container rounded-xl">
            <ArrowRightLeft className="w-6 h-6 text-on-primary-container" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">Conversor</h2>
            <p className="text-xs text-on-surface-variant">Converta arquivos locais rapidamente</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* File Selection */}
          <div className="p-4 bg-surface-container-high rounded-2xl border border-outline-variant/30 space-y-3">
            <h4 className="font-bold text-on-surface text-sm">Arquivo de Origem</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputFile}
                readOnly
                placeholder="Selecione um arquivo..."
                className="flex-1 bg-surface-container-low border border-outline-variant/30 rounded-xl px-3 py-2 text-sm text-on-surface outline-none overflow-hidden text-ellipsis whitespace-nowrap"
              />
              <button
                onClick={handleChooseFile}
                disabled={isConverting}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-on-primary text-sm font-bold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              >
                Buscar
              </button>
            </div>
          </div>

          {/* Format Selection */}
          <div className="p-4 bg-surface-container-high rounded-2xl border border-outline-variant/30 space-y-3">
            <h4 className="font-bold text-on-surface text-sm">{t('outputFormat') || 'Formato de Saída'}</h4>
            <div className="grid grid-cols-5 gap-2">
              {['mp3', 'wav', 'flac', 'm4a', 'ogg'].map((fmt) => (
                <button
                  key={fmt}
                  disabled={isConverting}
                  onClick={() => setOutputFormat(fmt)}
                  className={`py-2 rounded-xl text-xs font-bold uppercase transition-all border ${
                    outputFormat === fmt
                      ? 'bg-primary text-on-primary border-primary shadow-md scale-105'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30 hover:border-outline-variant hover:text-on-surface'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Status Message */}
          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className={`p-3 rounded-xl border flex items-start gap-2 ${
                  status === 'success'
                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                }`}
              >
                                {status === 'success' ? <CheckCircle className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium mt-0.5">{message}</p>
                  {status === 'success' && outputPath && (
                    <div className="mt-2 bg-green-500/20 rounded-lg p-2 flex flex-col gap-2 border border-green-500/20">
                      <p className="text-[10px] font-mono break-all opacity-80">{outputPath}</p>
                      <button 
                        onClick={handleOpenFile} 
                        className="flex items-center gap-1.5 self-start bg-green-500/30 hover:bg-green-500/50 text-green-300 transition-colors px-3 py-1.5 rounded-lg text-xs font-bold"
                      >
                        <FolderOpen size={14} /> Abrir Arquivo
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Button */}
          <button
            onClick={handleConvert}
            disabled={!inputFile || isConverting}
            className="w-full py-3 bg-primary hover:bg-primary/90 disabled:bg-surface-container-high disabled:text-on-surface-variant text-on-primary font-bold rounded-2xl transition-all shadow-lg flex items-center justify-center gap-2"
          >
            {isConverting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" /> Convertendo...
              </>
            ) : (
              <>
                <FileAudio className="w-5 h-5" /> Iniciar Conversão
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
