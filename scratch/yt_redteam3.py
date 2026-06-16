import urllib.request
import urllib.error
import json

API_URL = "https://www.youtube.com/youtubei/v1"
VIDEO_ID = "dQw4w9WgXcQ"

def post_json(url, payload, headers=None):
    if headers is None:
        headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8')), response.status
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode('utf-8')), e.code
        except:
            return str(e), e.code
    except Exception as e:
        return str(e), 500

def get_client_context(client_name, client_version, os_name="Windows"):
    return {
        "context": {
            "client": {
                "hl": "en",
                "gl": "US",
                "clientName": client_name,
                "clientVersion": client_version,
                "osName": os_name,
            }
        }
    }

print("\n[4] Testando Sistemas Embarcados (Roku, FireTV, Android Auto, etc)...")
clients_to_test = [
    ("ANDROID_TV", "1.0", "Android"), 
    ("FIRE_TV", "1.0", "FireOS"),
    ("ROKU", "1.0", "RokuOS"),
    ("WEB_AUTO", "1.0", "Android"),
    ("ANDROID_MUSIC", "6.22.52", "Android"),
    ("TVHTML5_SIMPLYLITE", "2.0", "Web")
]

for client_name, client_version, os_name in clients_to_test:
    payload = get_client_context(client_name, client_version, os_name)
    payload["videoId"] = VIDEO_ID
    
    resp, status = post_json(f"{API_URL}/player", payload)
    
    playability = resp.get("playabilityStatus", {}).get("status", "UNKNOWN")
    has_streams = "streamingData" in resp
    reason = resp.get("playabilityStatus", {}).get("reason", "")
    
    print(f"  -> Client [{client_name}]: Status={playability} | Tem Streams? {'SIM' if has_streams else 'NAO'}")
    if reason:
        print(f"     Motivo: {reason}")
