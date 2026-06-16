import os
import urllib.request
import zipfile
import shutil
import sys

ARIA2_URL = "https://github.com/aria2/aria2/releases/download/release-1.37.0/aria2-1.37.0-win-64bit-build1.zip"
ZIP_PATH = "aria2_temp.zip"

def install():
    if os.path.exists("aria2c.exe"):
        print("aria2c.exe ja existe.")
        return

    print("Baixando aria2c...")
    urllib.request.urlretrieve(ARIA2_URL, ZIP_PATH)
    
    print("Extraindo aria2c...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
        for member in zip_ref.namelist():
            if member.endswith("aria2c.exe"):
                # Extract specifically the exe
                source = zip_ref.open(member)
                target = open("aria2c.exe", "wb")
                with source, target:
                    shutil.copyfileobj(source, target)
                break
                
    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)
        
    print("aria2c instalado com sucesso!")

if __name__ == "__main__":
    install()
