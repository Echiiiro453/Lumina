import re

def fix_lastfm_settings():
    with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # State for Last.fm
    if "const [lastfmUser, setLastfmUser]" not in content:
        content = content.replace(
            "const [searchLimit, setSearchLimit] = useState(30);",
            "const [searchLimit, setSearchLimit] = useState(30);\n  const [lastfmUser, setLastfmUser] = useState('');\n  const [lastfmPass, setLastfmPass] = useState('');"
        )
        
    # Fetch Last.fm settings on open
    if "axios.get(`${apiUrl}/api/settings/lastfm`)" not in content:
        content = content.replace(
            "axios.get(`${apiUrl}/api/settings/search_limit`)",
            "axios.get(`${apiUrl}/api/settings/search_limit`)\n        .then(res => setSearchLimit(res.data.value))\n        .catch(console.error);\n      axios.get(`${apiUrl}/api/settings/lastfm`)\n        .then(res => { setLastfmUser(res.data.username); setLastfmPass(res.data.password); })\n        .catch(console.error);\n      // dummy to replace old line:"
        )
        
    # Save Last.fm function
    if "const handleSaveLastfm" not in content:
        save_js = """
  const handleSaveLastfm = async () => {
    try {
      await axios.post(`${apiUrl}/api/settings/lastfm`, { username: lastfmUser, password: lastfmPass });
    } catch(e) { console.error(e); }
  };
"""
        content = content.replace(
            "const fetchVoiceStatus = async () => {",
            save_js + "\n  const fetchVoiceStatus = async () => {"
        )
        
    # UI Section
    if "Last.fm Scrobbling" not in content:
        lastfm_jsx = """
              <div className="pt-4 mt-4 border-t border-outline-variant/20">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
                    <Music size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-on-surface">Last.fm Scrobbling</p>
                    <p className="text-xs text-on-surface-variant">Registre automaticamente</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant">Usuario</label>
                    <input
                      type="text"
                      value={lastfmUser}
                      onChange={(e) => setLastfmUser(e.target.value)}
                      onBlur={handleSaveLastfm}
                      className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-on-surface-variant">Senha</label>
                    <input
                      type="password"
                      value={lastfmPass}
                      onChange={(e) => setLastfmPass(e.target.value)}
                      onBlur={handleSaveLastfm}
                      className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                    />
                  </div>
                </div>
              </div>
"""
        # Insert before Shutdown block
        content = content.replace(
            "              {/* Shutdown */}",
            lastfm_jsx + "\n              {/* Shutdown */}"
        )

    with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

fix_lastfm_settings()
