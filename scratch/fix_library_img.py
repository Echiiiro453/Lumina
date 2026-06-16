import re

with open('frontend/src/components/LibraryModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('mqdefault.jpg', '0.jpg')

with open('frontend/src/components/LibraryModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
