import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    backend_content = f.read()

backend_replacement = """@app.post("/api/settings/lastfm")
async def save_lastfm_settings(req: LastfmSettingsRequest):
    import pylast
    from database import set_setting
    try:
        if req.username and req.password:
            API_KEY = "45abac6172ea06f1115f89a7ee4dd76c"
            API_SECRET = "6025770414ec2518c1c694ddc27e57e6"
            password_hash = pylast.md5(req.password)
            network = pylast.LastFMNetwork(
                api_key=API_KEY,
                api_secret=API_SECRET,
                username=req.username,
                password_hash=password_hash,
            )
            # Try to fetch user info to validate
            network.get_authenticated_user().get_name()
    except Exception as e:
        raise HTTPException(status_code=401, detail="Usuário ou senha do Last.fm incorretos.")
        
    set_setting("lastfm_username", req.username)
    set_setting("lastfm_password", req.password)
    return {"status": "ok"}"""

backend_content = re.sub(
    r'@app\.post\("/api/settings/lastfm"\)\nasync def save_lastfm_settings\(req: LastfmSettingsRequest\):\n.*?return \{"status": "ok"\}',
    backend_replacement,
    backend_content,
    flags=re.DOTALL
)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(backend_content)


with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
    frontend_content = f.read()

frontend_content = frontend_content.replace(
    'const [lastfmPass, setLastfmPass] = useState(\'\');',
    'const [lastfmPass, setLastfmPass] = useState(\'\');\n  const [isSavingLastfm, setIsSavingLastfm] = useState(false);'
)

handle_save_orig = """  const handleSaveLastfm = async () => {
    try {
      await axios.post(`${apiUrl}/api/settings/lastfm`, { username: lastfmUser, password: lastfmPass });
    } catch(e) { console.error(e); }
  };"""

handle_save_new = """  const handleSaveLastfm = async () => {
    setIsSavingLastfm(true);
    try {
      await axios.post(`${apiUrl}/api/settings/lastfm`, { username: lastfmUser, password: lastfmPass });
      alert(lastfmUser && lastfmPass ? "Login do Last.fm confirmado e salvo com sucesso!" : "Credenciais do Last.fm removidas.");
    } catch(e) { 
      alert(e.response?.data?.detail || "Erro ao conectar com Last.fm"); 
    } finally {
      setIsSavingLastfm(false);
    }
  };"""

frontend_content = frontend_content.replace(handle_save_orig, handle_save_new)

frontend_content = frontend_content.replace('onBlur={handleSaveLastfm}', '')

inputs_section_orig = """                    <div className="space-y-2">
                      <label className="text-xs font-medium text-on-surface-variant">Senha</label>
                      <input
                        type="password"
                        value={lastfmPass}
                        onChange={(e) => setLastfmPass(e.target.value)}
                        
                        className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                      />
                    </div>
                  </div>"""

inputs_section_new = """                    <div className="space-y-2">
                      <label className="text-xs font-medium text-on-surface-variant">Senha</label>
                      <input
                        type="password"
                        value={lastfmPass}
                        onChange={(e) => setLastfmPass(e.target.value)}
                        
                        className="w-full bg-surface-variant rounded-xl px-4 py-3 text-sm text-on-surface outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <button 
                      onClick={handleSaveLastfm}
                      disabled={isSavingLastfm}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors"
                    >
                      {isSavingLastfm ? 'Testando login...' : 'Salvar Login do Last.fm'}
                    </button>
                  </div>"""

frontend_content = frontend_content.replace(inputs_section_orig, inputs_section_new)

with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
    f.write(frontend_content)
