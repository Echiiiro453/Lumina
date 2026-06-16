import re

with open('backend/database.py', 'r', encoding='utf-8') as f:
    content = f.read()

index_queries = """        cur.execute("CREATE INDEX IF NOT EXISTS idx_video_id ON downloads (video_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_title ON downloads (title);")
        cur.execute(\"\"\"
            CREATE TABLE IF NOT EXISTS app_settings ("""

content = re.sub(
    r'cur\.execute\(\"\"\"\n\s+CREATE TABLE IF NOT EXISTS app_settings \(',
    index_queries,
    content
)

with open('backend/database.py', 'w', encoding='utf-8') as f:
    f.write(content)
