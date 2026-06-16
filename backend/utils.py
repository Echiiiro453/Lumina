import os
import sys

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        path = os.path.join(sys._MEIPASS, relative_path)
        if os.path.exists(path): return path
    path = os.path.join(get_base_dir(), relative_path)
    if os.path.exists(path): return path
    path = os.path.join(os.getcwd(), relative_path)
    if os.path.exists(path): return path
    return relative_path

def get_data_dir():
    try:
        from com.chaquo.python import Python
        context = Python.getPlatform().getApplication()
        return str(context.getFilesDir().getAbsolutePath())
    except:
        pass
        
    if getattr(sys, 'frozen', False):
        base = os.path.dirname(sys.executable)
        if "Program Files" in base:
            appdata = os.environ.get('APPDATA')
            if appdata:
                path = os.path.join(appdata, "AppMusica")
                os.makedirs(path, exist_ok=True)
                return path
        return base
    return os.path.dirname(os.path.abspath(__file__))

def get_downloads_dir():
    try:
        import sqlite3
        db_path = os.path.join(get_data_dir(), "downloads.db")
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            cur.execute("SELECT value FROM app_settings WHERE key = 'download_folder'")
            row = cur.fetchone()
            conn.close()
            if row and row[0] and os.path.isdir(row[0]):
                return row[0]
    except Exception as e:
        print(f"Erro ao buscar pasta personalizada: {e}")
        
    try:
        from com.chaquo.python import Python
        from android.os import Environment
        return str(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getAbsolutePath())
    except:
        pass
        
    data_dir = get_data_dir()
    if "Program Files" in os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else False:
        user_home = os.path.expanduser("~")
        return os.path.join(user_home, "Downloads", "AppMusica")
        
    return os.path.join(data_dir, "downloads")

def get_studio_dir():
    d_dir = get_downloads_dir()
    path = os.path.join(d_dir, "AppMusica_Studio")
    os.makedirs(path, exist_ok=True)
    return path

def get_shazam_dir():
    d_dir = get_downloads_dir()
    path = os.path.join(d_dir, "AppMusica_Lab")
    os.makedirs(path, exist_ok=True)
    return path

def parse_time(time_str):
    if not time_str or time_str.strip() == "": return None
    try:
        parts = list(map(int, time_str.split(':')))
        if len(parts) == 1: return parts[0]
        if len(parts) == 2: return parts[0] * 60 + parts[1]
        if len(parts) == 3: return parts[0] * 3600 + parts[1] * 60 + parts[2]
    except:
        return None
    return None

def get_cookies_path():
    user_path = os.path.join(get_data_dir(), 'cookies.txt')
    if os.path.exists(user_path):
        return user_path
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        bundled_path = os.path.join(sys._MEIPASS, 'cookies.txt')
        if os.path.exists(bundled_path):
            return bundled_path
    return None



def clean_url(url: str) -> str:
    import urllib.parse
    try:
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        for param in ["si", "pp", "utm_source", "utm_medium", "utm_campaign", "gclid", "fbclid"]:
            qs.pop(param, None)
        new_query = urllib.parse.urlencode(qs, doseq=True)
        return urllib.parse.urlunparse(parsed._replace(query=new_query))
    except:
        return url
