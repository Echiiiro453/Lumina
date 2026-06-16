import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'"-to", str\(end_s\),\s*"-map_metadata", "0",\s*temp_path',
    '"-to", str(end_s),\n              "-map", "0",\n              "-c", "copy",\n              "-map_metadata", "0",\n              temp_path',
    content
)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
