import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_indent = """        # Install Python silently
                import asyncio
        proc = await asyncio.create_subprocess_exec(installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0")"""

good_indent = """        # Install Python silently
        import asyncio
        proc = await asyncio.create_subprocess_exec(installer_path, "/passive", "InstallAllUsers=0", "PrependPath=1", "Include_test=0")"""

content = content.replace(bad_indent, good_indent)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
