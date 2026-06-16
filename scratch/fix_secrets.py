import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded API keys in save_lastfm_settings
content = re.sub(
    r'API_KEY = "45abac6172ea06f1115f89a7ee4dd76c"\n\s+API_SECRET = "6025770414ec2518c1c694ddc27e57e6"',
    r'API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")\n            API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")',
    content
)

# Replace hardcoded API keys in scrobble_track
content = re.sub(
    r'# API Key pública comumente usada para open-source players\n\s+API_KEY = "45abac6172ea06f1115f89a7ee4dd76c"\n\s+API_SECRET = "6025770414ec2518c1c694ddc27e57e6"',
    r'API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")\n        API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")',
    content
)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
