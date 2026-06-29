import os
import re
import sys


class SafePathError(Exception):
    """Levantada quando um file_path resolve para fora do diretório raiz permitido
    (path traversal) ou não existe. Chamadores FastAPI devem converter em HTTPException."""
    pass

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
    # NOTA: o fallback _MEIPASS/cookies.txt foi removido propositalmente. Cookies NUNCA
    # devem vir de dentro do executável empacotado — se alguém deixar um cookies.txt ao
    # lado do source na hora do build, ele seria embutido e a sessão vazaria dentro do
    # Lumina.exe. Cookies ficam exclusivamente no data dir do usuário (via /upload_cookies).
    return None



def sanitize_paths(text, root=None):
    """Mascara paths absolutos em texto de log (yt-dlp/FFmpeg stderr) por <path>/basename.

    stderr/stdout de subprocess frequentemente contêm o caminho absoluto do arquivo do
    usuário (ex.: 'C:\\Users\\nome\\Music\\faixa.mp3'). Isso evita vazar o nome de usuário
    e estrutura de pastas para o log buffer que é exposto em /api/logs.

    Mantém o basename (útil p/ debug) e troca o diretório por <path>.
    """
    if not text:
        return text
    if root is None:
        try:
            root = get_downloads_dir()
        except Exception:
            root = None

    def _mask(m):
        full = m.group(0)
        base = os.path.basename(full.rstrip("/\\"))
        return f"<path>/{base}" if base else "<path>"

    # Windows: letra:\...\ ; Unix: /home/... , /Users/... , /mnt|media|tmp|var|opt/...
    pattern = r'(?:[A-Za-z]:[\\/][^\s"\']+|/(?:home|Users|mnt|media|tmp|var|opt)[^\s"\']*)'
    out = re.sub(pattern, _mask, text)
    if root:
        out = out.replace(root, "<downloads>")
    return out


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


def safe_resolve(file_path, root=None, must_exist=True, allow_dirs=False):
    """Resolve file_path de forma segura dentro de root (default: downloads dir).

    Bloqueia path traversal (..) e paths absolutos que escapem do root. Resolve symlinks
    via os.path.realpath antes de comparar com os.path.commonpath, evitando bypass por
    links simbólicos.

    - file_path: pode ser relativo (junta a root) ou absoluto (precisa estar dentro de root).
    - root: diretório raiz permitido. Default get_downloads_dir().
    - must_exist: se True (default), levanta SafePathError se o arquivo não existir.
    - allow_dirs: se True, aceita diretórios (default exige arquivo regular).

    Retorna o caminho absoluto (str) dentro de root.
    Levanta SafePathError em caso de traversal/inexistência.
    """
    if root is None:
        root = get_downloads_dir()
    root_real = os.path.realpath(root)

    candidate = file_path
    if not os.path.isabs(candidate):
        candidate = os.path.join(root_real, candidate)
    abs_path = os.path.realpath(candidate)

    # commonpath exige que ambos existam; compara as strings de realpath para travessia.
    try:
        if os.path.commonpath([abs_path, root_real]) != root_real:
            raise SafePathError("Caminho fora da biblioteca")
    except ValueError:
        # commonpath levanta ValueError se os paths estiverem em drives distintos (Windows)
        raise SafePathError("Caminho fora da biblioteca")

    if must_exist and not os.path.exists(abs_path):
        raise SafePathError("Arquivo não encontrado")

    if must_exist and not allow_dirs and not os.path.isfile(abs_path):
        raise SafePathError("Caminho não é um arquivo")

    return abs_path

