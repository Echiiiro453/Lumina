import sqlite3
import os

app_data = os.environ.get('APPDATA')
db_path = os.path.join(app_data, "youtubeMusicDownload", "downloads.db")

if not os.path.exists(db_path):
    print("No DB:", db_path)
else:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT video_id FROM downloads WHERE status='downloaded' LIMIT 5")
    print(cur.fetchall())
