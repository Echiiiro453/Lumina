import re

with open('frontend/src/App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix toast styling
content = content.replace(
    'className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-900/90 backdrop-blur text-white px-6 py-3 rounded-full shadow-2xl border border-red-500/30 flex items-center gap-3 z-50"',
    'className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-red-900/90 backdrop-blur text-white px-6 py-3 rounded-3xl shadow-2xl border border-red-500/30 flex flex-col items-center gap-2 z-50 whitespace-pre-wrap max-w-[90vw] md:max-w-lg text-center"'
)

# Fix span styling inside the toast
content = content.replace(
    '<span className="font-medium">{message}</span>',
    '<span className="font-medium text-sm leading-snug">{message}</span>'
)

with open('frontend/src/App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
