import os

file_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\MobileSyncModal.jsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add states
states_str = """  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [token, setToken] = useState(null);
  const [pendingDevice, setPendingDevice] = useState(null);"""

content = content.replace("  const [ip, setIp] = useState('');\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState(null);", states_str)

# 2. Modify first useEffect to get IP AND token
new_effect = """  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setPendingDevice(null);
      setToken(null);
      
      Promise.all([
        fetch('http://localhost:8000/api/network/ip').then(res => res.json()),
        fetch('http://localhost:8000/api/mobile/token/create', {method: 'POST'}).then(res => res.json())
      ])
        .then(([ipData, tokenData]) => {
          setIp(ipData.ip);
          setToken(tokenData.token);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError('Não foi possível inicializar a conexão.');
          setLoading(false);
        });
    }
  }, [isOpen]);

  // Polling for connection
  useEffect(() => {
    if (!isOpen || !token) return;
    let isMounted = true;
    
    const interval = setInterval(() => {
      fetch(`http://localhost:8000/api/mobile/token/status?token=${token}`)
        .then(res => {
          if (!res.ok) throw new Error('Token expired');
          return res.json();
        })
        .then(data => {
          if (!isMounted) return;
          if (!data.approved && data.device_name) {
            setPendingDevice(data.device_name);
          } else if (data.approved) {
            setPendingDevice(null);
          }
        })
        .catch(() => {
          if (isMounted) setError('A sessão expirou. Feche e abra novamente.');
        });
    }, 1500);
    
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen, token]);

  const handleApprove = () => {
    fetch(`http://localhost:8000/api/mobile/token/approve?token=${token}`, { method: 'POST' })
      .then(() => setPendingDevice(null))
      .catch(console.error);
  };
"""

content = content.replace("""  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      fetch('http://localhost:8000/api/network/ip')
        .then(res => res.json())
        .then(data => {
          setIp(data.ip);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError('Nǜo foi possvel obter o IP local. Verifique se o servidor estǭ em execuǜo.');
          setLoading(false);
        });
    }
  }, [isOpen]);""", new_effect)


# 3. Modify url definition
content = content.replace("  const url = ip ? `http://${ip}:8000/api/mobile` : '';", "  const url = ip && token ? `http://${ip}:8000/api/mobile?token=${token}` : '';")

# 4. Modify JSX body
old_jsx_body = """            <>
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
                <h3 className="text-lg font-bold text-on-surface">Escaneie o QR Code</h3>
                <p className="text-on-surface-variant text-sm flex items-center justify-center gap-1.5">
                  <Wifi className="w-4 h-4" />
                  Celular e PC devem estar na mesma rede Wi-Fi
                </p>
              </div>

              {/* URL manual */}
              <div className="w-full bg-surface-container-high border border-outline-variant/30 rounded-2xl p-3 text-sm text-on-surface-variant font-mono break-all select-all">
                {url}
              </div>
            </>"""

new_jsx_body = """            <>
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
                    <h3 className="text-lg font-bold text-on-surface">Escaneie o QR Code</h3>
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
            </>"""

content = content.replace(old_jsx_body, new_jsx_body)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated MobileSyncModal.jsx successfully")
