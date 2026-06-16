import os
import re

base_dir = "e:/youtubr/youtubeMusicDownload-main/frontend/src/components"

replacements = {
    "TagEditorModal.jsx": [
        ("Importar .lrc", "{t('importLrc') || 'Importar .lrc'}"),
        ("{saving ? 'Salvando...' : 'Salvar Tags'}", "{saving ? (t('saving') || 'Salvando...') : (t('saveTags') || 'Salvar Tags')}")
    ],
    "SubscriptionsModal.jsx": [
        (">Carregando...<", ">{t('loading') || 'Carregando...'}<")
    ],
    "StudioModal.jsx": [
        ("Qualidade (Redução de Ruído)", "{t('studioQuality') || 'Qualidade (Redução de Ruído)'}"),
        ("Baixar e Instalar Inteligência Artificial", "{t('studioDownloadAI') || 'Baixar e Instalar Inteligência Artificial'}"),
        ("1. Baixar Python (Site Oficial)", "1. {t('studioDownloadPython') || 'Baixar Python (Site Oficial)'}")
    ],
    "SpotifyModal.jsx": [
        (">Importar Playlist<", ">{t('importPlaylist') || 'Importar Playlist'}<")
    ],
    "PlayerBar.jsx": [
        (">Duração<", ">{t('duration') || 'Duração'}<"),
        (">Qualidade<", ">{t('quality') || 'Qualidade'}<")
    ],
    "MobileSyncModal.jsx": [
        (">Carregando informações da rede...<", ">{t('loading') || 'Carregando informações da rede...'}<")
    ],
    "LibraryModal.jsx": [
        ("> Carregando biblioteca...<", "> {t('libraryLoading') || 'Carregando biblioteca...'}<"),
        (">Sua Biblioteca<", ">{t('libraryTitle') || 'Sua Biblioteca'}<"),
        (">Abrir Pasta<", ">{t('openFolder') || 'Abrir Pasta'}<"),
        ("title=\"Atualizar\"", "title={t('refresh') || 'Atualizar'}")
    ],
    "HistoryModal.jsx": [
        (">Atualizar<", ">{t('refresh') || 'Atualizar'}<")
    ],
    "ConverterModal.jsx": [
        (">Formato de Saída<", ">{t('outputFormat') || 'Formato de Saída'}<")
    ],
    "UpdateModal.jsx": [
        ("Baixar Atualização", "{t('updateDownload') || 'Baixar Atualização'}")
    ],
    "TermsModal.jsx": [
        ("Carregando termos...", "{t('loadingTerms') || 'Carregando termos...'}")
    ],
    "TopAppBar.jsx": [
        ("title=\"Sincronizar com Celular\"", "title={t('syncWithMobile') || 'Sincronizar com Celular'}")
    ]
}

# Also the SettingsModal.jsx changes I lost:
settings_replacements = [
    ('className="flex gap-2"', 'className="flex flex-wrap gap-2"'),
    ("Aparência", "{t('settingsTabAppearance')}"),
    ("Downloads", "{t('settingsTabDownloads')}"),
    ("Sistema", "{t('settingsTabSystem')}"),
    ("Aparência & Interface", "{t('settingsHeaderAppearance')}"),
    ("Comandos de Voz (BETA)", "{t('settingsVoiceCommand')}"),
    ('⚠️ <b>Aviso:</b> Esta função está em fase de testes. Controle músicas offline dizendo "Lumina Pausar", "Lumina Próxima", etc. Ao ativar pela 1ª vez, o app baixará 40MB do motor de IA.', "{t('settingsVoiceWarning')}"),
    ("'Microfone Ligado (Escutando...)'", "t('settingsVoiceOn')"),
    ("'Baixando Motor de Voz (40MB)...'", "t('settingsVoiceDownloading')"),
    ("'Ativar Reconhecimento de Voz'", "t('settingsVoiceActivate')"),
    ("Wallpaper / Tema Monet", "{t('settingsWallpaperHeader')}"),
    ("Escolha uma imagem ou vídeo para colorir o app dinamicamente (M3).", "{t('settingsWallpaperDesc')}"),
    ("> Escolher Arquivo", "> {t('settingsWallpaperChoose')}"),
    (">Escolher Arquivo<", ">{t('settingsWallpaperChoose')}<"),
    (">Remover<", ">{t('settingsWallpaperRemove')}<"),
    ("Intensidade do Desfoque", "{t('settingsBlurLevel')}"),
    ("label: 'Sem Desfoque'", "label: t('settingsBlurNone')"),
    ("label: 'Suave'", "label: t('settingsBlurSm')"),
    ("label: 'Médio'", "label: t('settingsBlurMd')"),
    ("label: 'Forte'", "label: t('settingsBlur3xl')"),
    ("Downloads & Autenticação", "{t('settingsDownloadsHeader')}")
]
replacements["SettingsModal.jsx"] = settings_replacements

for filename, reps in replacements.items():
    filepath = os.path.join(base_dir, filename)
    if not os.path.exists(filepath):
        print(f"Skipping {filename}, not found.")
        continue
        
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
        
    for old, new in reps:
        content = content.replace(old, new)
        
    if "import { t }" not in content and "import {t}" not in content:
        # inject just below import React
        content = re.sub(r"(import React.*?;\n)", r"\1import { t } from '../i18n';\n", content, count=1)
        
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

print("Replaced strings successfully without destroying the files!")
