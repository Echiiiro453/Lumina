import os

file_path = r"e:\youtubr\youtubeMusicDownload-main\backend\main.py"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add import for discord_rpc and start it on startup
startup_old = """async def startup_event():
    import threading"""

startup_new = """async def startup_event():
    import threading
    try:
        import discord_rpc
        threading.Thread(target=discord_rpc.connect_rpc, daemon=True).start()
    except Exception as e:
        print(f"Failed to start Discord RPC: {e}")"""

content = content.replace(startup_old, startup_new)

# 2. Add /api/miniplayer/state endpoint which also updates Discord RPC
rpc_endpoint = """

class MiniplayerStateRequest(BaseModel):
    title: str
    artist: str
    cover_url: str = ""
    isPlaying: bool
    progress: float = 0.0
    duration: float = 0.0

# Global miniplayer state
_current_miniplayer_state = {}

@app.post("/api/miniplayer/state")
def update_miniplayer_state(req: MiniplayerStateRequest):
    global _current_miniplayer_state
    _current_miniplayer_state = req.dict()
    
    # Update Discord RPC
    try:
        import discord_rpc
        discord_rpc.update_presence(
            title=req.title,
            artist=req.artist,
            is_playing=req.isPlaying,
            cover_url=req.cover_url if req.cover_url and req.cover_url.startswith("http") else None
        )
    except Exception as e:
        pass
        
    return {"status": "success"}

@app.get("/api/miniplayer/state")
def get_miniplayer_state():
    return _current_miniplayer_state

"""

if "class MiniplayerStateRequest" not in content:
    content = content.replace("@app.post(\"/api/open_external\")", rpc_endpoint + "\n@app.post(\"/api/open_external\")")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Added RPC endpoints to main.py")
else:
    print("RPC endpoints already exist in main.py")
