from curl_cffi import requests
res = requests.get("https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb", impersonate="chrome120")
with open("apple_dump.html", "w", encoding="utf-8") as f:
    f.write(res.text)
