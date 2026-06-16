import os
import shutil
import glob

# Mudar para o diretório raiz do projeto
os.chdir(r'E:\youtubr\youtubeMusicDownload-main')

# 1. Arquivos para deletar permanentemente
to_delete = [
    'backend/main.py.backup',
    'backend/main.py.mangled',
    'backend/scratch_restore.py',
    'backend/ast_cleaner.py',
    'backend/cleanup_main.py',
    'backend/amazon_dump.html',
    'backend/apple.html',
    'backend/apple_dump.html',
    'backend/spotify_dump.html',
    'backend/spotify_dump_main.html',
    'backend/spotify_test.html',
    'backend/tidal_dump.html',
    'backend/error.log',
    'backend/pyinstaller_build_err.log',
    'backend/AppMusica.log',
    'backend/build_log.txt',
    'backend/search_endpoint.txt',
    'scratch/yt_deno_test.log',
    'scratch/yt_node_test.log',
    'scratch/yt_node_test2.log',
    'scratch/diff.txt',
    'scratch/diff_i18n.txt',
    'scratch/last_commit.txt',
    'scratch/routes.txt',
    'scratch/ast_nodes.txt',
    'yt-dlp-test.log',
]

# Deletar arquivos específicos
for file in to_delete:
    if os.path.exists(file):
        os.remove(file)
        print(f"Deletado: {file}")

# Deletar audios de teste no backend
test_media_patterns = [
    'backend/*.mp3',
    'backend/*.webm',
    'backend/*.unknown_video',
]
for pattern in test_media_patterns:
    for file in glob.glob(pattern):
        # Exceção para arquivos que podem ser essenciais se houver
        os.remove(file)
        print(f"Deletado mídia de teste: {file}")

# 2. Arquivos para mover do backend para scratch
to_move_patterns = [
    'backend/test_*.py',
    'backend/fix*.py',
    'backend/add_*.py',
    'backend/update_*.py',
    'backend/inject_*.py',
    'backend/dump_*.py',
    'backend/benchmark_*.py',
    'backend/install_*.py',
    'backend/kill_*.py',
    'backend/list_*.py',
    'backend/rebrand*.py',
    'backend/refactor*.py',
    'backend/shazam_fixer.py',
]

for pattern in to_move_patterns:
    for file in glob.glob(pattern):
        # Exceções (não mover)
        if file.endswith('update_mobile_security.py'): continue
        if file.endswith('update_mobile_modal.py'): continue
        if file.endswith('update_modals.py'): continue
        if file.endswith('update_player.py'): continue
        if file.endswith('update_playerbar.py'): continue
        if file.endswith('add_radio.py') or file.endswith('add_radio_frontend.py'): continue
        
        filename = os.path.basename(file)
        dest = os.path.join('scratch', filename)
        
        # Mover (substitui se existir)
        shutil.move(file, dest)
        print(f"Movido para scratch: {filename}")

# Deletar spec files e dirs vazios gerados pelas builds passadas
specs_to_delete = glob.glob('backend/*.spec')
for spec in specs_to_delete:
    if 'Lumina.spec' not in spec: # Keep Lumina.spec
        os.remove(spec)
        print(f"Deletado arquivo spec: {spec}")

print("Limpeza concluída com sucesso!")
