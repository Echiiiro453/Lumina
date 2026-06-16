import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# First, extract the app.mount("/", ...) block
static_mount_block = """static_dir = get_resource_path("static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")"""

# Remove it from its current position
content = content.replace(static_mount_block, "")

# Now insert it right before if __name__ == "__main__":
main_block = 'if __name__ == "__main__":'
content = content.replace(main_block, static_mount_block + "\n\n" + main_block)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
