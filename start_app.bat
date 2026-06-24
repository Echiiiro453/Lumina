@echo off
echo Iniciando Music Downloader Premium...

:: Atualizar o motor de download silenciosamente para evitar quebras futuras do YouTube
echo Verificando atualizacoes do motor de download...
start /wait "Update" cmd /c "cd backend && pip install -U yt-dlp -q && pip install curl-cffi==0.14.0 -q && python install_aria2.py"

:: Forçar Node.js no PATH para o EJS Challenge Solver
set "PATH=%PATH%;C:\Program Files\nodejs\"

:: Iniciar Backend (Sem VENV já que não existe na sua máquina)
start "Music Backend" /min cmd /k "cd backend && python backend_tray.py"

:: Aguardar um pouco para o backend subir
timeout /t 3

:: Iniciar Frontend
start "Music Frontend" cmd /k "cd frontend && npm run dev"

:: Abrir navegador
timeout /t 5
start http://localhost:5173

echo.
echo Tudo pronto! O app deve abrir no seu navegador.
echo IMPORTANTE: Os logs do Backend aparecerao na tela preta chamada "Music Backend". Mantenha ela aberta!
pause
