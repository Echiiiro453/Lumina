import os
import re

file_path = r'e:\youtubr\youtubeMusicDownload-main\frontend\src\components\SettingsModal.jsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add 'Cloud' to lucide-react imports
content = re.sub(
    r"from 'lucide-react';",
    r", Cloud } from 'lucide-react';",
    content
)
content = content.replace("Monitor, Cloud }", "Monitor, Cloud}") # fix if I duplicated

# 2. Add State variables
state_vars = """  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);"""

content = re.sub(
    r"(const \[voiceStatus, setVoiceStatus\] = useState\('stopped'\);)",
    r"\1\n" + state_vars,
    content
)

# 3. Add handle functions for Telegram
telegram_funcs = """
  const handleSaveTelegram = async () => {
    try {
      await axios.post(`${apiUrl}/api/settings/telegram`, { token: telegramToken, chat_id: telegramChatId });
      // saved silently or toast
    } catch(e) { }
  };

  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    try {
      const res = await axios.post(`${apiUrl}/api/settings/telegram/test`, { token: telegramToken, chat_id: telegramChatId });
      alert(res.data.message);
      handleSaveTelegram(); // save if test succeeds
    } catch(e) {
      alert(e.response?.data?.detail || "Erro ao testar o Telegram.");
    } finally {
      setIsTestingTelegram(false);
    }
  };
"""
content = re.sub(
    r"(const handleSaveLastfm = async \(\) => {)",
    telegram_funcs + r"\n  \1",
    content
)

# 4. Fetch Telegram data in useEffect
fetch_telegram = """
      axios.get(`${apiUrl}/api/settings/telegram`)
        .then(res => { setTelegramToken(res.data.token); setTelegramChatId(res.data.chat_id); })
        .catch(console.error);"""

content = re.sub(
    r"(axios\.get\(`\$\{apiUrl\}/api/settings/lastfm`\)\s*\.then[^\n]+\n\s*\.catch[^\n]+)",
    r"\1" + fetch_telegram,
    content
)

# 5. Add Tab Button
tab_button = """            <button
              onClick={() => setActiveTab('cloud')}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all text-sm whitespace-nowrap ${activeTab === 'cloud' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'}`}
            >
              <Cloud size={18} /> {t('settingsTabCloud') || 'Nuvem & Sync'}
            </button>"""

content = re.sub(
    r"(<Monitor size=\{18\} /> \{t\('settingsTabSystem'\) \|\| 'Sistema'\}\s*</button>)",
    r"\1\n" + tab_button,
    content
)

# 6. Add Tab Content
tab_content = """
          {/* TAB 4: CLOUD & SYNC */}
          {activeTab === 'cloud' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6 border-b border-outline-variant/20 pb-4">
                <Cloud className="w-5 h-5 text-primary" /> Nuvem & Sincronização
              </h3>

              <div className="p-4 bg-surface-container-high rounded-3xl border border-outline-variant/30 space-y-4">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Cloud className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Backup Infinito (Telegram)</h4>
                    <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                      O Lumina pode enviar automaticamente todas as músicas baixadas para o seu chat privado ou canal no Telegram. 
                      É um backup gratuito e infinito na nuvem, acessível do seu celular.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant ml-1">Bot Token (via @BotFather)</label>
                    <input
                      type="text"
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      onBlur={handleSaveTelegram}
                      placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-on-surface-variant ml-1">Chat ID (Onde o bot vai enviar)</label>
                    <input
                      type="text"
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      onBlur={handleSaveTelegram}
                      placeholder="Ex: 12345678 ou -100987654321"
                      className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 text-sm text-on-surface outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleTestTelegram}
                    disabled={isTestingTelegram || !telegramToken || !telegramChatId}
                    className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-lg shadow-blue-500/20 flex justify-center items-center gap-2"
                  >
                    {isTestingTelegram ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    {isTestingTelegram ? 'Testando Conexão...' : 'Testar Conexão com Telegram'}
                  </button>
                </div>
              </div>
            </div>
          )}
"""

content = re.sub(
    r"(<div className=\"flex-1 p-6 md:p-8 overflow-y-auto custom-scrollbar bg-surface-container relative\">)",
    r"\1\n" + tab_content,
    content
)

# Also fix the import correctly
content = content.replace("Monitor } from 'lucide-react';", "Monitor, Cloud } from 'lucide-react';")

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("SettingsModal.jsx atualizado com sucesso com a aba Cloud!")
