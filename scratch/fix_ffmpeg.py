import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_cmd = """          cmd = [
              "ffmpeg", "-y",
              "-i", req.file_path,
              "-ss", str(start_s),
              "-to", str(end_s),
              "-map_metadata", "0",
              temp_path
          ]"""

new_cmd = """          cmd = [
              "ffmpeg", "-y",
              "-i", req.file_path,
              "-ss", str(start_s),
              "-to", str(end_s),
              "-map", "0",
              "-c", "copy",
              "-map_metadata", "0",
              temp_path
          ]"""

content = content.replace(old_cmd, new_cmd)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
