import os

player_path = r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx"
with open(player_path, "r", encoding="utf-8") as f:
    content = f.read()

eq_code = """
      {showEqModal && (
        <EqualizerModal
          isOpen={showEqModal}
          onClose={() => setShowEqModal(false)}
          preset={eqPreset}
          onPresetChange={setEqPreset}
          gains={eqGains}
          onGainChange={handleGainChange}
        />
      )}
"""

if "<EqualizerModal" not in content and "isOpen={showEqModal}" not in content:
    content = content.replace("    </>\n  );\n}", eq_code + "    </>\n  );\n}")
    with open(player_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Restored EqualizerModal rendering")
else:
    print("EqualizerModal already exists")
