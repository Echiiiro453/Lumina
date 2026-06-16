import re

def inject_lastfm_settings():
    with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # State for Last.fm
    if "const [lastfmUser, setLastfmUser]" not in content:
        content = content.replace(
            "const [searchLimit, setSearchLimit] = useState(30);",
            "const [searchLimit, setSearchLimit] = useState(30);\n  const [lastfmUser, setLastfmUser] = useState('');\n  const [lastfmPass, setLastfmPass] = useState('');\n  const [lastfmSaved, setLastfmSaved] = useState(false);"
        )
        
    # Fetch Last.fm settings on open
    if "/api/settings/lastfm" not in content:
        content = content.replace(
            "setLibraryInitialTab(localStorage.getItem('lumina_library_initial_tab') || 'all');",
            "setLibraryInitialTab(localStorage.getItem('lumina_library_initial_tab') || 'all');\n      axios.get(getApiUrl('/api/settings/lastfm')).then(res => { setLastfmUser(res.data.username); setLastfmPass(res.data.password); }).catch(()=>{});"
        )
        
    # Save Last.fm settings
    if "save_lastfm_settings" not in content:
        save_js = """
    try {
      await axios.post(getApiUrl('/api/settings/lastfm'), { username: lastfmUser, password: lastfmPass });
    } catch(e) {}
"""
        content = content.replace(
            "onClose();",
            save_js + "\n    onClose();"
        )
        
    # UI Section
    if "Contas Vinculadas" not in content:
        lastfm_jsx = """
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-primary flex items-center gap-2">
              <Radio size={16} /> Contas Vinculadas
            </h3>
            
            <div className="bg-surface-container-highest rounded-2xl p-4 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                  <Music size={16} />
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">Last.fm Scrobbling</p>
                  <p className="text-xs text-on-surface-variant">Registre automaticamente o que você ouve</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-on-surface-variant">Usuário Last.fm</label>
                  <input
                    type="text"
                    value={lastfmUser}
                    onChange={(e) => setLastfmUser(e.target.value)}
                    className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 ring-primary/50 outline-none transition-all"
                    placeholder="Seu usuário"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-on-surface-variant">Senha Last.fm</label>
                  <input
                    type="password"
                    value={lastfmPass}
                    onChange={(e) => setLastfmPass(e.target.value)}
                    className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface focus:ring-2 ring-primary/50 outline-none transition-all"
                    placeholder="Sua senha"
                  />
                </div>
              </div>
            </div>
          </div>
"""
        # Insert before "{/* Botões de Ação */}"
        content = content.replace("{/* Botões de Ação */}", lastfm_jsx + "\n          {/* Botões de Ação */}")

    with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

inject_lastfm_settings()
