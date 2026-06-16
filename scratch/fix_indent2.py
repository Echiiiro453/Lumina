import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_indent = """        API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")
            API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")"""

good_indent = """        API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")
        API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")"""

content = content.replace(bad_indent, good_indent)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
