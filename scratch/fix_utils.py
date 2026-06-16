with open('backend/utils.py', 'rb') as f:
    content = f.read()

# PowerShell echo >> adds \xff\xfe and UTF-16 bytes (nulls).
# We can just remove all null bytes from the file.
cleaned_content = content.replace(b'\x00', b'')

# Also remove BOM if present
if cleaned_content.startswith(b'\xff\xfe'):
    cleaned_content = cleaned_content[2:]
if cleaned_content.startswith(b'\xef\xbb\xbf'):
    cleaned_content = cleaned_content[3:]

# Write it back cleanly as UTF-8
with open('backend/utils.py', 'wb') as f:
    f.write(cleaned_content)

print("Null bytes stripped from utils.py")
