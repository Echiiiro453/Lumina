import re

with open('backend/database.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_indent = '''        """)
                cur.execute("CREATE INDEX IF NOT EXISTS idx_video_id ON downloads (video_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_title ON downloads (title);")'''

good_indent = '''        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_video_id ON downloads (video_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_title ON downloads (title);")'''

content = content.replace(bad_indent, good_indent)

with open('backend/database.py', 'w', encoding='utf-8') as f:
    f.write(content)
