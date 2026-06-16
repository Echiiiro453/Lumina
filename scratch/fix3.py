import os
import re

player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add them back
content = content.replace("  // Lumina Extra Features", "  const [showInfo, setShowInfo] = useState(false);\n  const [showEqModal, setShowEqModal] = useState(false);\n  // Lumina Extra Features")

with open(player_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Restored showInfo and showEqModal.")
