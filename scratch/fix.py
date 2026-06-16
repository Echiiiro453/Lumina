import os

# 1. Fix PlayerBar.jsx states
player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    content = f.read()

states_to_add = """  const [isLooping, setIsLooping] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  
  // Lumina Extra Features
  const [sleepTimer, setSleepTimer] = useState(null);
  const [sleepTimeLeft, setSleepTimeLeft] = useState(null);
  const [showSleepMenu, setShowSleepMenu] = useState(false);
  const crossfadeGainRef = useRef(null);
  const [showEqModal, setShowEqModal] = useState(false);"""

if "const [sleepTimer" not in content:
    # Actually wait, `showEqModal` is probably used in PlayerBar? Yes. But my grep didn't show it.
    pass

# We can just inject after `const [showInfo, setShowInfo] = useState(false);`
import re
content = re.sub(
    r"const \[showInfo, setShowInfo\] = useState\(false\);",
    states_to_add,
    content
)

with open(player_path, "w", encoding="utf-8") as f:
    f.write(content)

# 2. Fix App.jsx AppMúsica to Lumina
app_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx"
with open(app_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("AppMúsica", "Lumina")
with open(app_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Bug fixes applied")
