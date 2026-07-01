"""
Fix App.jsx and PlayerBar.jsx encoding.
The files have UTF-8-BOM header but the content has some replacement characters (U+FFFD)
for bytes that PowerShell couldn't encode. We need to fix these replacement chars.
"""

fixes = {
    # Portuguese chars that appear as replacement chars due to BOM encoding issue
    '\ufffdudio': 'áudio',
    '\ufffd\xa0': 'Á',
    '\ufffdideo': 'vídeo',
    '\ufffdideos': 'vídeos',
    '\ufffdido': 'vídeo',
    '\ufffd\x9d\ufffd': '"',
    'QUALIDADE (\ufffdudio)': 'QUALIDADE (ÁUDIO)',
    '(\ufffdudio)': '(ÁUDIO)',
    # Common Portuguese sequences
    'estÃ\xa3o': 'estação',
    'configura\u00e7\u00e3o': 'configuração',
}

import os, re

# The real fix: the file has U+FFFD (replacement chars) where PowerShell couldn't convert
# We need to replace these based on context

for filepath in [
    r'e:\youtubr\youtubeMusicDownload-main\frontend\src\App.jsx',
    r'e:\youtubr\youtubeMusicDownload-main\frontend\src\components\PlayerBar.jsx',
]:
    if not os.path.exists(filepath):
        continue

    with open(filepath, 'r', encoding='utf-8-sig') as f:
        content = f.read()
    
    original = content
    
    # Fix specific broken sequences
    replacements = [
        # The \ufffd chars where specific bytes got lost
        ('\ufffdudio', 'áudio'),
        ('(\ufffdudio)', '(ÁUDIO)'),
        ('QUALIDADE (\ufffdudio)', 'QUALIDADE (ÁUDIO)'),
        ('\ufffd\xa0', 'Á'),
        ('V\ufffdideo', 'Vídeo'),
        ('v\ufffdideo', 'vídeo'),
        ('\ufffdideo', 'vídeo'),
        ('M\ufffdidal', 'Modal'),
        # Common Portuguese combinations that should be fine as UTF-8
    ]
    
    for wrong, right in replacements:
        content = content.replace(wrong, right)
    
    # Write back clean UTF-8 without BOM
    with open(filepath, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(content)
    
    changes = sum(1 for a, b in zip(original, content) if a != b)
    print(f'{"FIXED" if changes else "OK"}: {os.path.basename(filepath)}')
    
    # Report remaining replacement chars
    remaining = [(m.start(), content[max(0,m.start()-10):m.start()+20]) 
                 for m in re.finditer('\ufffd', content)]
    if remaining:
        print(f'  Still has {len(remaining)} replacement chars:')
        for pos, ctx in remaining[:5]:
            print(f'    pos {pos}: {repr(ctx)}')
