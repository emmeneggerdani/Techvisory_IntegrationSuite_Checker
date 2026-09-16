@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 3 /nobreak >nul && start "" http://localhost:3450"
npm start
