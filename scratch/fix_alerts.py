import re

with open('frontend/src/components/SettingsModal.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = {
    "console.error('Failed to get voice status', e);": "alert('Erro ao checar status do motor de voz: ' + e.message);",
    "console.error('Failed to toggle voice', e);": "alert('Erro ao ativar motor de voz: ' + e.message);",
    "console.error(\"Erro ao configurar inicialização:\", err);": "alert('Erro ao configurar inicialização junto ao Windows: ' + err.message);",
    "console.error('Failed to save concurrent downloads setting', e);": "alert('Erro ao salvar limite de downloads: ' + e.message);",
}

for old_str, new_str in replacements.items():
    content = content.replace(old_str, f"{old_str}\n        {new_str}")

with open('frontend/src/components/SettingsModal.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
