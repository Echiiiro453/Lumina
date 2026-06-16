import os
import re

player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    content = f.read()

# Remove the duplicates that my previous script injected
content = re.sub(r"  const \[isLooping, setIsLooping\] = useState\(false\);\n  const \[showInfo, setShowInfo\] = useState\(false\);\n  \n  // Lumina Extra Features", "// Lumina Extra Features", content)
content = re.sub(r"  const \[showEqModal, setShowEqModal\] = useState\(false\);\n", "", content)

with open(player_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Duplicates removed.")
