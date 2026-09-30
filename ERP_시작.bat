@echo off
chcp 65001 >nul
title KAISER ERP 시작

echo ========================================
echo   KAISER ERP 시작 중...
echo ========================================

:: 기존 프로세스 종료
echo [1/4] 기존 프로세스 정리...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8002 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 3 /nobreak >nul

:start_backend
:: 백엔드 실행
echo [2/4] 백엔드 서버 시작 (포트 8002)...
start "KAISER-Backend" /MIN cmd /k "cd /d C:\Users\240710P\OneDrive\joy_erp\backend && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002"

:: 백엔드 뜰 때까지 대기 (최대 30초)
echo [3/4] 백엔드 준비 대기 중...
set /a cnt=0
:wait_backend
timeout /t 2 /nobreak >nul
netstat -aon 2>nul | findstr ":8002 " | findstr LISTENING >nul
if %errorlevel%==0 goto backend_ready
set /a cnt+=1
if %cnt% lss 15 goto wait_backend

:: 30초 내 실패 → 자동 재시도
echo.
echo    [재시도] 백엔드 응답 없음. 자동 재시작 중...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8002 " ^| findstr LISTENING') do taskkill /F /PID %%a >nul 2>&1
timeout /t 3 /nobreak >nul
goto start_backend

:backend_ready
echo    백엔드 준비 완료!

:: 프론트엔드 실행
echo [4/4] 프론트엔드 시작...
start "KAISER-Frontend" /MIN cmd /k "C:\kaiser_frontend.bat"
timeout /t 12 /nobreak >nul

:: 브라우저 열기
start "" "http://localhost:5173"

echo.
echo ========================================
echo   실행 완료!
echo   로컬:  http://localhost:5173
echo   LAN:   http://192.168.0.113:5173
echo ========================================
timeout /t 3 /nobreak >nul
