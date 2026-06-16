import re
import os

MAIN_FILE = 'main.py'
ROUTERS_DIR = 'routers'

with open(MAIN_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Estratégia: vamos extrair os blocos baseados nos decorators @app.
# Encontrar todos os inícios de rota
pattern = r'^@app\.(get|post|delete|put|websocket)\([^\)]+\)\n(?:async def|def).*?(?=\n@app\.|\Z)'
# Isso não funciona bem porque pode haver funções auxiliares ou decorators entre as rotas.

# A melhor forma manual é eu criar os arquivos routers/downloads.py etc.,
# e usar expressões regulares precisas no arquivo para extrair e deletar do main.py.
