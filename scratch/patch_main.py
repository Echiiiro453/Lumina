import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    text = f.read()

if "from routers.settings import router as settings_router" not in text:
    text = text.replace(
        'app.include_router(library_router)',
        'app.include_router(library_router)\nfrom routers.settings import router as settings_router\napp.include_router(settings_router)'
    )

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Patching main.py with settings_router successful!")
