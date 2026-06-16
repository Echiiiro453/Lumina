import re

def inject_trim_button():
    with open('frontend/src/components/LibraryModal.jsx', 'r', encoding='utf-8') as f:
        content = f.read()
        
    # 1. Add Scissors to lucide-react import
    if "Scissors" not in content and "lucide-react" in content:
        content = content.replace(
            "import { X, Play, FolderOpen, RefreshCw, Music, Users, ChevronLeft, Disc,",
            "import { X, Play, FolderOpen, RefreshCw, Music, Users, ChevronLeft, Disc, Scissors,"
        )
        # fallback if not in the first line:
        content = content.replace("import { X, Play", "import { Scissors, X, Play")

    # 2. Add onTrimAudio to props
    if "onTrimAudio" not in content:
        content = content.replace(
            "onEditTags, onDownload, initialArtist }",
            "onEditTags, onTrimAudio, onDownload, initialArtist }"
        )
        
    # 3. Add the button next to Edit3
    if "<Scissors size={15} />" not in content:
        button_jsx = """
          {onTrimAudio && song.file_path && (
            <button
              onClick={(e) => { e.stopPropagation(); onTrimAudio(song); }}
              className="p-2 rounded-full hover:bg-white/10 text-on-surface-variant hover:text-on-surface transition-colors"
              title="Cortar Áudio"
            >
              <Scissors size={15} />
            </button>
          )}
"""
        content = content.replace(
            "<Edit3 size={15} />\n            </button>\n          )",
            "<Edit3 size={15} />\n            </button>\n          )" + button_jsx
        )
        
    with open('frontend/src/components/LibraryModal.jsx', 'w', encoding='utf-8') as f:
        f.write(content)

inject_trim_button()
