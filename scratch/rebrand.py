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
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\index.html", "AppMusica", "Prisma Player")

# 2. Update build scripts
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\build_exe.py", "AppMusica", "PrismaPlayer")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\build_exe_ai.py", "AppMusica", "PrismaPlayer")

# 3. Update i18n
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\i18n.js", "AppMusica Studio", "Prisma Studio")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\i18n.js", "AppMusica", "Prisma Player")

# 4. Update SubscriptionsModal.jsx
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\components\SubscriptionsModal.jsx", "AppMusica", "Prisma Player")

# 5. Update App.jsx
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx", "AppMusica", "Prisma Player")

# 6. Update backend main.py instances
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\main.py", "AppMusica", "Prisma Player")
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\main.py", "AppMusica Sync", "Prisma Sync")

# 7. Update miniplayer.py
replace_in_file(r"e:\youtubr\youtubeMusicDownload-main\backend\miniplayer.py", "AppMusica", "Prisma Player")

print("Rebranding to Prisma Player completed.")
