import re

def add_settings_to_db():
    with open('backend/database.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    code_to_insert = """
def set_setting(key: str, value: str):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);", (key, value))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Erro ao salvar setting: {e}")

def get_setting(key: str, default: str = None) -> str:
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT value FROM app_settings WHERE key = ?;", (key,))
        row = cur.fetchone()
        conn.close()
        return row["value"] if row else default
    except:
        return default
"""
    
    if "def set_setting" not in content:
        content += code_to_insert
        with open('backend/database.py', 'w', encoding='utf-8') as f:
            f.write(content)
            
add_settings_to_db()
