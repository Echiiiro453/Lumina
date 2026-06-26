"""
Apply all necessary fixes to App.jsx and PlayerBar.jsx cleanly.
Runs on the original git-restored files (no encoding corruption).
"""
import re, os

# ---- 1. App.jsx fixes ----
APP = r'e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx'
with open(APP, 'r', encoding='utf-8') as f:
    app = f.read()

# 1a. Replace API_URL with dynamic hostname
app = app.replace(
    'const API_URL = "http://localhost:8000";',
    'const API_URL = `${window.location.protocol}//${window.location.hostname}:8000`;'
)

# 1b. Fix open_folder hardcoded URL
app = app.replace(
    "onClick={() => axios.post('http://localhost:8000/open_folder')}",
    "onClick={() => axios.post(getApiUrl('/open_folder'))}"
)

# 1c. Import RippleButton
app = app.replace(
    "import { QueueItem } from './components/QueueItem';",
    "import { RippleButton } from './components/Ripple';\nimport { QueueItem } from './components/QueueItem';"
)

# 1d. Top bar — replace buttons with RippleButton (proper sizing)
OLD_TOPBAR = """        <div className="flex items-center gap-2">
          {/* Top Bar Actions */}
          <button
            onClick={() => setShowStudioModal(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title={t('studioTitle')}
          >
            <Mic className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowShazamModal(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title={t('shazamTitle')}
          >
            <Search className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowLibrary(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title={t('navLibrary')}
          >
            <List className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title="Histórico"
          >
            <Clock className="w-6 h-6" />
          </button>
          <button
            onClick={() => checkForUpdates(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title={t('btnUpdateTitle')}
          >
            <RefreshCw className={`w-6 h-6 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowDonate(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors"
            title={t('btnDonate')}
          >
            <Heart className="w-6 h-6" />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="w-12 h-12 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors relative"
            title={t('btnConfigure')}
          >
            <Settings className="w-6 h-6" />
            {isAuthenticated && (
              <span className="absolute top-2 right-2 w-3 h-3 bg-green-500 border-2 border-surface rounded-full"></span>
            )}
          </button>"""

NEW_TOPBAR = """        <div className="flex items-center gap-1">
          {/* Top Bar Actions */}
          <RippleButton onClick={() => setShowStudioModal(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('studioTitle')}>
            <Mic className="w-5 h-5" />
          </RippleButton>
          <RippleButton onClick={() => setShowShazamModal(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('shazamTitle')}>
            <Search className="w-5 h-5" />
          </RippleButton>
          <RippleButton onClick={() => setShowLibrary(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('navLibrary')}>
            <List className="w-5 h-5" />
          </RippleButton>
          <RippleButton onClick={() => setShowHistory(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title="Histórico">
            <Clock className="w-5 h-5" />
          </RippleButton>
          <RippleButton onClick={() => checkForUpdates(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('btnUpdateTitle')}>
            <RefreshCw className={`w-5 h-5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
          </RippleButton>
          <RippleButton onClick={() => setShowDonate(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('btnDonate')}>
            <Heart className="w-5 h-5" />
          </RippleButton>
          <div className="relative">
            <RippleButton onClick={() => setShowSettings(true)} className="w-11 h-11 rounded-full hover:bg-surface-variant text-on-surface-variant flex items-center justify-center transition-colors" title={t('btnConfigure')}>
              <Settings className="w-5 h-5" />
            </RippleButton>
            {isAuthenticated && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-green-500 border-2 border-surface rounded-full pointer-events-none"></span>
            )}
          </div>"""

if OLD_TOPBAR in app:
    app = app.replace(OLD_TOPBAR, NEW_TOPBAR)
    print('TOP BAR: replaced')
else:
    print('TOP BAR: not found — check whitespace')

with open(APP, 'w', encoding='utf-8') as f:
    f.write(app)
print('App.jsx saved.')

# ---- 2. PlayerBar.jsx — fix localhost ----
PB = r'e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx'
with open(PB, 'r', encoding='utf-8') as f:
    pb = f.read()

pb = pb.replace(
    "const encodedFile = encodeURIComponent(currentSong.file);\n      const url = `http://localhost:8000/downloads/${encodedFile}`;",
    "const urlPath = currentSong.file.split(/[\\\\/]/).map(encodeURIComponent).join('/');\n      const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`;\n      const url = `${baseUrl}/downloads/${urlPath}`;"
)
pb = pb.replace(
    "fetch(`http://localhost:8000/api/track_metadata?file_path=${encodedFile}`)",
    "fetch(`${baseUrl}/api/track_metadata?file_path=${encodeURIComponent(currentSong.file)}`)"
)

# Also fix the open_external localhost
pb = pb.replace(
    "await fetch('http://localhost:8000/api/open_external',",
    "await fetch(`${window.location.protocol}//${window.location.hostname}:8000/api/open_external`,"
)

with open(PB, 'w', encoding='utf-8') as f:
    f.write(pb)
print('PlayerBar.jsx saved.')
print('All done!')
