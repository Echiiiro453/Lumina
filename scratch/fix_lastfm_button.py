import re

with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# I will use a regex to inject the button right after the Last.fm inputs container
pattern = r'(<input\s+type="password"\s+value=\{lastfmPass\}.*?/>\s*</div>\s*</div>)'

replacement = r'''\1
                  <div className="flex justify-end mt-4">
                    <button 
                      onClick={handleSaveLastfm}
                      disabled={isSavingLastfm}
                      className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 transition-colors shadow-lg"
                    >
                      {isSavingLastfm ? 'Testando login...' : 'Salvar Login do Last.fm'}
                    </button>
                  </div>'''

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
