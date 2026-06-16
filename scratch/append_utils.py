with open('backend/utils.py', 'a', encoding='utf-8') as f:
    f.write('''

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
''')
