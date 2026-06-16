import os
import re

player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    content = f.read()

gain_code = """  const handleGainChange = (bandIndex, value) => {
    setEqGains(prev => {
      const newGains = [...prev];
      newGains[bandIndex] = value;
      return newGains;
    });
    setEqPreset('Personalizado');
  };"""

if "handleGainChange =" not in content:
    content = content.replace("  const eqFiltersRef = useRef([]);", "  const eqFiltersRef = useRef([]);\n" + gain_code)

content = re.sub(
    r'<RippleButton \n   \n                    className="text-on-surface-variant/50 hover:text-on-surface transition-colors"',
    r'<RippleButton onClick={() => setShowInfo(true)} className="text-on-surface-variant/50 hover:text-on-surface transition-colors"',
    content
)

with open(player_path, "w", encoding="utf-8") as f:
    f.write(content)
print("Fixed Eq & Info button.")
