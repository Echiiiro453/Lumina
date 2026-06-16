import re

with open('backend/main.py', 'r', encoding='utf-8') as f:
    content = f.read()

bad_indent_1 = """            API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")
        API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")
            password_hash = pylast.md5(req.password)"""

good_indent_1 = """            API_KEY = os.environ.get("LASTFM_API_KEY", "45abac6172ea06f1115f89a7ee4dd76c")
            API_SECRET = os.environ.get("LASTFM_API_SECRET", "6025770414ec2518c1c694ddc27e57e6")
            password_hash = pylast.md5(req.password)"""

content = content.replace(bad_indent_1, good_indent_1)

with open('backend/main.py', 'w', encoding='utf-8') as f:
    f.write(content)
