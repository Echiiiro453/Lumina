import re

f = open('e:/youtubr/youtubeMusicDownload-main/frontend/src/App.jsx', 'r', encoding='utf-8-sig')
content = f.read()
f.close()

corrupt = re.findall(r'[\xc3\xe2][\x80-\xbf\xa3\xa1\xa9\xad\xb3\xba\xa2\xb5\xb4\xa0\x80-\x9f][^\s<>"]{0,10}', content)
print('Corrupt samples:')
for s in sorted(set(corrupt))[:30]:
    print(repr(s))
