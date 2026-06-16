import sqlite3
import os

db_path = 'backend/app_data.db'
if not os.path.exists(db_path):
    print("No database.")
else:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("SELECT video_id FROM downloads LIMIT 5")
    print("video_ids:", cur.fetchall())
    
    cur.execute("PRAGMA table_info(downloads)")
    print("schema:", cur.fetchall())
