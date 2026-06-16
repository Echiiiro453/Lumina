import re

with open('frontend/src/components/LibraryModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

import_line_match = re.search(r"import \{.*?\} from 'lucide-react';", content)
if import_line_match:
    import_line = import_line_match.group(0)
    # Remove all "Scissors," and then append it once
    new_import_line = import_line.replace(' Scissors,', '').replace('Scissors, ', '')
    new_import_line = new_import_line.replace("} from 'lucide-react';", ", Scissors } from 'lucide-react';")
    content = content.replace(import_line, new_import_line)

with open('frontend/src/components/LibraryModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
