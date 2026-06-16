import re

def add_lastfm_to_main():
    with open('backend/main.py', 'r', encoding='utf-8') as f:
        content = f.read()
        
    code_to_insert = """
class LastfmSettingsRequest(BaseModel):
    username: str
    password: str

@app.post("/api/settings/lastfm")
async def save_lastfm_settings(req: LastfmSettingsRequest):
    from database import set_setting
    set_setting("lastfm_username", req.username)
    set_setting("lastfm_password", req.password)
    return {"status": "ok"}

@app.get("/api/settings/lastfm")
async def get_lastfm_settings():
    from database import get_setting
    return {
        "username": get_setting("lastfm_username", ""),
        "password": get_setting("lastfm_password", "")
    }

class ScrobbleRequest(BaseModel):
    title: str
    artist: str

@app.post("/api/scrobble")
async def scrobble_track(req: ScrobbleRequest):
    from database import get_setting
    import time
    username = get_setting("lastfm_username", "")
    password = get_setting("lastfm_password", "")
    if not username or not password:
        return {"status": "ignored", "detail": "Credenciais não configuradas"}
        
    try:
        import pylast
        # API Key pública comumente usada para open-source players
        API_KEY = "b25b959554ed76058ac220b7b2e0a026"
        API_SECRET = "425b55975eedaf59ebcebdbe148ec411"
        password_hash = pylast.md5(password)
        network = pylast.LastFMNetwork(
            api_key=API_KEY,
            api_secret=API_SECRET,
            username=username,
            password_hash=password_hash,
        )
        network.scrobble(artist=req.artist, title=req.title, timestamp=int(time.time()))
        return {"status": "ok"}
    except Exception as e:
        print("Last.fm erro:", e)
        raise HTTPException(status_code=500, detail=str(e))
"""
    
    if "class LastfmSettingsRequest" not in content:
        # Insert before if __name__ == "__main__":
        parts = content.split('if __name__ == "__main__":')
        new_content = parts[0] + code_to_insert + '\nif __name__ == "__main__":' + parts[1]
        
        with open('backend/main.py', 'w', encoding='utf-8') as f:
            f.write(new_content)
            
add_lastfm_to_main()
