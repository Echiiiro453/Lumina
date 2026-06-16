import os

def replace_in_file(filepath, old_str, new_str):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    if old_str in content:
        content = content.replace(old_str, new_str)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

# 1. Update index.html
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\index.html", "Prisma Player", "Lumina")

# 2. Update build scripts
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\build_exe.py", "PrismaPlayer", "Lumina")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\build_exe_ai.py", "PrismaPlayer", "Lumina")

# 3. Update i18n
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\i18n.js", "Prisma Studio", "Lumina Studio")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\i18n.js", "Prisma Player", "Lumina")

# 4. Update SubscriptionsModal.jsx
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\SubscriptionsModal.jsx", "Prisma Player", "Lumina")

# 5. Update App.jsx
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx", "Prisma Player", "Lumina")

# 6. Update backend main.py instances
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\main.py", "Prisma Player", "Lumina")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\main.py", "Prisma Sync", "Lumina Sync")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\main.py", "AppMusica_Downloads.zip", "Lumina_Downloads.zip")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\miniplayer.py", "Prisma Player", "Lumina")

print("Rebranding to Lumina completed.")
