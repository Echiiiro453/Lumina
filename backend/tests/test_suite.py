"""
=======================================================
  LUMINA - Suite de Testes Automáticos (v3.8.0)
=======================================================
  Testa os endpoints do backend local em http://localhost:8000
  Execute com: python tests/test_suite.py
  (o App Lumina precisa estar rodando antes!)
"""

import requests
import json
import time
import sys
import os

# Force UTF-8 output so emojis in song titles don't crash
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

BASE = "http://localhost:8000"
PASS = "\033[92m[PASS]\033[0m"
FAIL = "\033[91m[FAIL]\033[0m"
SKIP = "\033[93m[SKIP]\033[0m"
INFO = "\033[94m[INFO]\033[0m"

results = {"passed": 0, "failed": 0, "skipped": 0}


def check(condition: bool, name: str, detail: str = ""):
    if condition:
        print(f"  {PASS} {name}")
        results["passed"] += 1
    else:
        print(f"  {FAIL} {name}" + (f" — {detail}" if detail else ""))
        results["failed"] += 1


def skip(name: str, reason: str = ""):
    print(f"  {SKIP} {name}" + (f" — {reason}" if reason else ""))
    results["skipped"] += 1


def section(title: str):
    print(f"\n\033[1;35m{'='*55}\033[0m")
    print(f"\033[1;35m  {title}\033[0m")
    print(f"\033[1;35m{'='*55}\033[0m")


def get(path: str, **kwargs):
    try:
        return requests.get(BASE + path, timeout=10, **kwargs)
    except Exception as e:
        return None


def post(path: str, **kwargs):
    try:
        return requests.post(BASE + path, timeout=10, **kwargs)
    except Exception:
        return None


def delete(path: str, **kwargs):
    try:
        return requests.delete(BASE + path, timeout=10, **kwargs)
    except Exception:
        return None


# ──────────────────────────────────────────────
# PRÉ-REQUISITO: Servidor acessível?
# ──────────────────────────────────────────────
print(f"\n\033[1;36m  Lumina Test Suite v3.8.0\033[0m")
print(f"  Alvo: {BASE}\n")

try:
    _ping = requests.get(BASE + "/version", timeout=5)
except Exception:
    print(f"  {FAIL} Servidor NÃO está acessível em {BASE}")
    print("  ➜  Abra o Lumina primeiro e tente novamente.\n")
    sys.exit(2)

print(f"  {PASS} Servidor respondendo em {BASE}")


# ──────────────────────────────────────────────
# 1. SAÚDE DO SERVIDOR
# ──────────────────────────────────────────────
section("1. Saúde do Servidor")

r = get("/version")
check(r is not None and r.status_code == 200, "/version retorna 200")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Versão reportada: {data.get('version', 'N/A')}")
    check("version" in data, "/version retorna campo 'version'")

r = get("/api/logs")
check(r is not None and r.status_code == 200, "/api/logs retorna 200")

r = get("/terms/status")
check(r is not None and r.status_code == 200, "/terms/status retorna 200")

r = get("/auth_status")
check(r is not None and r.status_code == 200, "/auth_status retorna 200")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Cookie autenticado: {data.get('authenticated', False)}")


# ──────────────────────────────────────────────
# 2. CONFIGURAÇÕES
# ──────────────────────────────────────────────
section("2. Configurações")

r = get("/api/settings/concurrent_downloads")
check(r is not None and r.status_code == 200, "GET concurrent_downloads")
if r and r.status_code == 200:
    data = r.json()
    check("value" in data, "concurrent_downloads tem campo 'value'")
    print(f"  {INFO} Downloads simultâneos: {data.get('value')}")

r = get("/api/settings/start_minimized")
check(r is not None and r.status_code == 200, "GET start_minimized")

r = get("/api/settings/miniplayer_hotkey")
check(r is not None and r.status_code == 200, "GET miniplayer_hotkey")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Hotkey do MiniPlayer: {data.get('hotkey', 'N/A')}")

r = get("/api/settings/download_folder")
check(r is not None and r.status_code == 200, "GET download_folder")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Pasta de downloads: {data.get('folder', 'N/A')}")


# ──────────────────────────────────────────────
# 3. BIBLIOTECA E HISTÓRICO
# ──────────────────────────────────────────────
section("3. Biblioteca e Histórico")

r = get("/api/library")
check(r is not None and r.status_code == 200, "GET /api/library retorna 200")
if r and r.status_code == 200:
    data = r.json()
    items = data if isinstance(data, list) else data.get("tracks", data.get("items", []))
    print(f"  {INFO} Músicas na biblioteca: {len(items) if isinstance(items, list) else '?'}")

r = get("/api/history")
check(r is not None and r.status_code == 200, "GET /api/history retorna 200")
if r and r.status_code == 200:
    data = r.json()
    items = data if isinstance(data, list) else data.get("history", data.get("items", []))
    print(f"  {INFO} Entradas no histórico: {len(items) if isinstance(items, list) else '?'}")

r = get("/api/downloads/list")
if r is not None and r.status_code == 403:
    skip("GET /api/downloads/list", "Requer token Mobile (403 esperado sem token)")
else:
    check(r is not None and r.status_code == 200, "GET /api/downloads/list retorna 200")

r = get("/download/jobs")
check(r is not None and r.status_code == 200, "GET /download/jobs retorna 200")
if r and r.status_code == 200:
    data = r.json()
    active = [j for j in data if j.get("status") not in ("done", "error")] if isinstance(data, list) else []
    print(f"  {INFO} Jobs ativos no momento: {len(active)}")


# ──────────────────────────────────────────────
# 4. FAVORITOS
# ──────────────────────────────────────────────
section("4. Favoritos")

r = get("/api/favorites")
check(r is not None and r.status_code == 200, "GET /api/favorites retorna 200")
if r and r.status_code == 200:
    data = r.json()
    items = data if isinstance(data, list) else data.get("favorites", data.get("items", []))
    print(f"  {INFO} Músicas favoritas: {len(items) if isinstance(items, list) else '?'}")

TEST_VID = "dQw4w9WgXcQ"
r = get(f"/api/favorites/check/{TEST_VID}")
check(r is not None and r.status_code == 200, f"GET /api/favorites/check/{{video_id}} retorna 200")

r = post("/api/favorites/add", json={"video_id": TEST_VID, "title": "[TESTE] Rick Astley", "file_path": "test.mp3"})
check(r is not None and r.status_code == 200, "POST /api/favorites/add funciona")

r = delete(f"/api/favorites/{TEST_VID}")
check(r is not None and r.status_code == 200, "DELETE /api/favorites/{video_id} funciona")


# ──────────────────────────────────────────────
# 5. PRESETS DE EQUALIZAÇÃO
# ──────────────────────────────────────────────
section("5. Presets de Equalização")

r = get("/presets")
check(r is not None and r.status_code == 200, "GET /presets retorna 200")
if r and r.status_code == 200:
    data = r.json()
    items = data if isinstance(data, list) else data.get("presets", [])
    print(f"  {INFO} Presets disponíveis: {len(items) if isinstance(items, list) else '?'}")

# Testa salvar um preset temporário
test_preset = {"name": "__LUMINA_TEST__", "pitch": 0.0, "speed": 1.0, "eq": "normal"}
r = post("/presets", json=test_preset)
check(r is not None and r.status_code == 200, "POST /presets (criar preset de teste)")


# ──────────────────────────────────────────────
# 6. ASSINATURAS
# ──────────────────────────────────────────────
section("6. Assinaturas de Playlists")

r = get("/api/subscriptions")
check(r is not None and r.status_code == 200, "GET /api/subscriptions retorna 200")
if r and r.status_code == 200:
    data = r.json()
    count = len(data) if isinstance(data, list) else "?"
    print(f"  {INFO} Playlists assinadas: {count}")


# ──────────────────────────────────────────────
# 7. BUSCA (sem download, apenas pesquisa)
# ──────────────────────────────────────────────
section("7. Busca no YouTube")

search_payload = {"query": "lofi hip hop", "limit": 3}
r = post("/search", json=search_payload)
check(r is not None and r.status_code == 200, "POST /search retorna 200")
if r and r.status_code == 200:
    data = r.json()
    results_list = data if isinstance(data, list) else data.get("results", [])
    check(len(results_list) > 0, f"Busca retornou {len(results_list)} resultado(s)")
    if results_list:
        first = results_list[0]
        title = str(first.get('title', 'N/A')).encode('ascii', 'replace').decode()
        uploader = str(first.get('uploader', 'N/A')).encode('ascii', 'replace').decode()
        print(f"  {INFO} 1 resultado: \"{title}\" por {uploader}")
else:
    skip("Busca retornou resultados", "Endpoint falhou")


# ──────────────────────────────────────────────
# 8. INFO DE VÍDEO
# ──────────────────────────────────────────────
section("8. Extração de Metadados de Vídeo")

info_payload = {"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
r = post("/info", json=info_payload)
check(r is not None and r.status_code == 200, "POST /info retorna 200 (Never Gonna Give You Up)")
if r and r.status_code == 200:
    data = r.json()
    check("title" in data or "id" in data, "POST /info retornou metadados com 'title'")
    print(f"  {INFO} Título: {data.get('title', 'N/A')}")
    print(f"  {INFO} Canal: {data.get('uploader', 'N/A')}")
else:
    skip("Metadados de vídeo", f"Status: {r.status_code if r else 'sem resposta'}")


# ──────────────────────────────────────────────
# 9. WINDOWS — INTEGRAÇÃO (Single Instance, Registro)
# ──────────────────────────────────────────────
section("9. Integração com Windows")

r = post("/api/set_default_player")
if r is not None:
    check(r.status_code == 200, "POST /api/set_default_player (registro no Windows)")
    if r.status_code != 200:
        print(f"  {INFO} Detalhe do erro: {r.text[:120]}")
else:
    skip("Registro no Windows", "Endpoint inacessível")

r = get("/api/network/ip")
check(r is not None and r.status_code == 200, "GET /api/network/ip (IP local para Mobile)")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} IP da rede local: {data.get('ip', 'N/A')}")


# ──────────────────────────────────────────────
# 10. STUDIO (Demucs)
# ──────────────────────────────────────────────
section("10. Studio (Separação de Vocais)")

r = get("/api/studio/jobs")
check(r is not None and r.status_code == 200, "GET /api/studio/jobs retorna 200")

r = get("/api/voice/status")
check(r is not None and r.status_code == 200, "GET /api/voice/status retorna 200")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Reconhecimento de voz ativo: {data.get('active', False)}")


# ──────────────────────────────────────────────
# 11. DB SYNC
# ──────────────────────────────────────────────
section("11. Sincronização do Banco de Dados")

r = get("/api/db/sync")
check(r is not None and r.status_code == 200, "GET /api/db/sync retorna 200")
if r and r.status_code == 200:
    data = r.json()
    print(f"  {INFO} Resposta do sync: {str(data)[:80]}")


# ──────────────────────────────────────────────
# RESUMO FINAL
# ──────────────────────────────────────────────
total = results["passed"] + results["failed"] + results["skipped"]
print(f"\n{'='*55}")
print(f"\033[1m  RESULTADO FINAL — {total} testes\033[0m")
print(f"  {PASS} Passaram : {results['passed']}")
print(f"  {FAIL} Falharam : {results['failed']}")
print(f"  {SKIP} Pulados  : {results['skipped']}")
print(f"{'='*55}\n")

if results["failed"] > 0:
    sys.exit(1)
else:
    sys.exit(0)
