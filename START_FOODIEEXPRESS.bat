@echo off
setlocal
cd /d "%~dp0"
set "WINDIR=C:\Windows"
set "PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;%PATH%"
set "ComSpec=C:\Windows\System32\cmd.exe"
if not exist "server\.env" (
  copy "server\.env.example" "server\.env" >nul
  echo Created server\.env. Edit it with your MySQL password if required, then run this file again.
  notepad "server\.env"
  pause
  exit /b
)
if not exist "node_modules" (
  echo Installing project packages...
  call npm install
  if errorlevel 1 pause & exit /b 1
)
start "FoodieExpress Backend" cmd /k "cd /d ""%~dp0"" && set ""WINDIR=C:\Windows"" && set ""PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;%PATH%"" && set ""ComSpec=C:\Windows\System32\cmd.exe"" && npm run backend"
timeout /t 2 /nobreak >nul
start "FoodieExpress Frontend" cmd /k "cd /d ""%~dp0"" && set ""WINDIR=C:\Windows"" && set ""PATH=C:\Windows\System32;C:\Windows;C:\Windows\System32\Wbem;%PATH%"" && set ""ComSpec=C:\Windows\System32\cmd.exe"" && npm run frontend"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173/"
echo FoodieExpress is starting. Keep both terminal windows open.
