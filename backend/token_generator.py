import os
import sys
import json
import time
import subprocess

# Cache for the PO Token to avoid generating it on every request
_token_cache = {
    "visitorData": None,
    "poToken": None,
    "timestamp": 0
}

# 6 hours cache validity (PO Tokens usually last 12-24 hours)
CACHE_DURATION = 6 * 60 * 60

def get_po_token(force_refresh=False):
    """
    Executes the JS library to generate a real PO Token and caches it.
    Returns a tuple: (visitorData, poToken)
    """
    global _token_cache
    
    now = time.time()
    
    # Return cached token if valid and not forcing a refresh
    if not force_refresh and _token_cache["poToken"] and (now - _token_cache["timestamp"] < CACHE_DURATION):
        return _token_cache["visitorData"], _token_cache["poToken"]
        
    try:
        # Determine paths
        if getattr(sys, 'frozen', False):
            # If running as PyInstaller executable
            base_dir = sys._MEIPASS
            po_token_dir = os.path.join(base_dir, 'po_token')
        else:
            # If running from source
            base_dir = os.path.dirname(os.path.abspath(__file__))
            po_token_dir = os.path.join(base_dir, 'po_token')
            
        script_path = os.path.join(po_token_dir, 'generate.js')
        
        # Create the JS script if it doesn't exist (useful for first run or PyInstaller)
        if not os.path.exists(script_path):
            os.makedirs(po_token_dir, exist_ok=True)
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write("""
const { generate } = require('youtube-po-token-generator');
generate().then(console.log).catch(console.error);
                """)
                
        # Call node to execute the script
        # Note: In PyInstaller, we might want to use the bundled node.exe if available,
        # but for now we assume node is available in the environment or we use the OS node.
        # Ideally, yt-dlp uses its own JS interpreter or we call node.cmd
        
        # Windows specific: hide console window
        startupinfo = None
        if os.name == 'nt':
            startupinfo = subprocess.STARTUPINFO()
            startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW

        result = subprocess.run(
            ['node', script_path], 
            capture_output=True, 
            text=True, 
            cwd=po_token_dir,
            startupinfo=startupinfo,
            check=True
        )
        
        # Parse output
        # Output is like: { visitorData: '...', poToken: '...' }
        # The library uses console.log which might not be strict JSON (might have unquoted keys)
        # So we parse it carefully or use JSON if the library outputs strict JSON
        output = result.stdout.strip()
        
        # Fast extraction since the output is a JS object string
        import ast
        try:
            # Try to parse it securely if it's strict JSON
            data = json.loads(output)
        except json.JSONDecodeError:
            # If it's a JS object string, fallback to ast
            # Replace single quotes with double quotes for JSON parsing
            clean_output = output.replace("'", '"')
            # Add quotes to keys if missing
            import re
            clean_output = re.sub(r'([{,]\s*)([a-zA-Z0-9_]+)(\s*:)', r'\1"\2"\3', clean_output)
            try:
                data = json.loads(clean_output)
            except:
                # Absolute fallback parsing
                import re
                visitorData = re.search(r"visitorData:\s*['\"]([^'\"]+)['\"]", output).group(1)
                poToken = re.search(r"poToken:\s*['\"]([^'\"]+)['\"]", output).group(1)
                data = {"visitorData": visitorData, "poToken": poToken}

        
        _token_cache["visitorData"] = data.get("visitorData")
        _token_cache["poToken"] = data.get("poToken")
        _token_cache["timestamp"] = now
        
        print(f"[PO-Token] Token gerado com sucesso! (Tamanho: {len(_token_cache['poToken'])})")
        return _token_cache["visitorData"], _token_cache["poToken"]
        
    except Exception as e:
        print(f"[PO-Token] Erro ao gerar token: {e}")
        # Fallback to the dummy token that works for VODs
        return "dummy_visitor", "aGVsbG8gd29ybGQh"

if __name__ == "__main__":
    print("Testando gerador de PO Token...")
    vdata, token = get_po_token()
    print(f"Visitor Data: {vdata}")
    print(f"PO Token: {token}")
