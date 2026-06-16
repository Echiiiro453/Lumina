import re

def inject_trimmer_to_app():
    with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 1. Import
    if "import { AudioTrimmerModal }" not in content:
        content = content.replace(
            "import { TagEditorModal } from './components/TagEditorModal';",
            "import { TagEditorModal } from './components/TagEditorModal';\nimport { AudioTrimmerModal } from './components/AudioTrimmerModal';"
        )
        
    # 2. State
    if "const [trimEditorSong, setTrimEditorSong]" not in content:
        content = content.replace(
            "const [tagEditorSong, setTagEditorSong] = useState(null);",
            "const [tagEditorSong, setTagEditorSong] = useState(null);\n  const [trimEditorSong, setTrimEditorSong] = useState(null);"
        )
        
    # 3. Pass to LibraryModal
    if "onEditTags={(song) => setTagEditorSong(song)}" in content and "onTrimAudio" not in content:
        content = content.replace(
            "onEditTags={(song) => setTagEditorSong(song)}",
            "onEditTags={(song) => setTagEditorSong(song)}\n        onTrimAudio={(song) => setTrimEditorSong(song)}"
        )
        
    # 4. Render AudioTrimmerModal
    if "<AudioTrimmerModal" not in content:
        trimmer_jsx = """
      <AudioTrimmerModal
        isOpen={!!trimEditorSong}
        onClose={() => setTrimEditorSong(null)}
        song={trimEditorSong}
        getApiUrl={getApiUrl}
        onSaved={() => {
          // You could optionally refresh the library here
        }}
      />
"""
        content = content.replace(
            "<TagEditorModal",
            trimmer_jsx + "\n      <TagEditorModal"
        )
        
    with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

inject_trimmer_to_app()
