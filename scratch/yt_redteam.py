import urllib.request
import urllib.error
import json
import time

# YouTube InnerTube API endpoint
API_URL = "https://www.youtube.com/youtubei/v1"

# Standard video: Rickroll
VIDEO_ID = "dQw4w9WgXcQ"
# Age Restricted video (often used for testing): r6-p-BVRNEs (GTA V trailer) or similar. We'll use a generic one or just test the endpoints.

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
                "osName": os_name
            }
        }
    }

print("=== YOUTUBE SCRAPING REDTEAM LAB ===\n")

# 1. TESTE DE BUSCA E RATE LIMITING
print("[1] Testando Limites da API de Busca (Client: WEB)...")
search_payload = get_client_context("WEB", "2.20240101.00.00")
search_payload["query"] = "test"
success_count = 0
for i in range(3):
    start = time.time()
    resp, status = post_json(f"{API_URL}/search", search_payload)
    elapsed = time.time() - start
    if status == 200 and "contents" in resp:
        print(f"  -> Requisicao {i+1}: SUCESSO ({elapsed:.2f}s)")
        success_count += 1
    else:
        print(f"  -> Requisicao {i+1}: FALHA (Status {status}) - YouTube bloqueou ou exigiu cookies.")
        break
    time.sleep(0.5) # Simulating rapid scraping

# 2. TESTE DE BYPASS DE CLIENTE (Extração de Stream)
print("\n[2] Testando Extracao de Player usando Diferentes Dispositivos...")
clients_to_test = [
    ("WEB", "2.20240101.00.00", "Windows"), 
    ("TVHTML5", "7.20230412.00.00", "Web"), # Smart TV
    ("ANDROID", "18.30.37", "Android")      # Mobile App
]

for client_name, client_version, os_name in clients_to_test:
    payload = get_client_context(client_name, client_version, os_name)
    payload["videoId"] = VIDEO_ID
    
    resp, status = post_json(f"{API_URL}/player", payload)
    
    # Check for playability status
    playability = resp.get("playabilityStatus", {}).get("status", "UNKNOWN")
    reason = resp.get("playabilityStatus", {}).get("reason", "")
    
    # Check if streaming URLs (streamingData) are provided
    has_streams = "streamingData" in resp
    
    print(f"  -> Client [{client_name}]: Status={playability} | Tem Streams? {'SIM' if has_streams else 'NAO'}")
    if reason:
        print(f"     Motivo: {reason}")
    if playability == "LOGIN_REQUIRED":
        print("     [!] Este cliente foi barrado pelo YouTube (exige Po-Token ou Cookies).")

print("\n=== FIM DOS TESTES ===")
