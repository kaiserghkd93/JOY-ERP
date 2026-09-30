@echo off
chcp 65001 > nul
title KAISER ERP

echo ========================================
echo   KAISER ERP 시작
echo ========================================

:: 기존 포트 프로세스 종료
echo [1/3] 기존 서버 정리중...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":8002 " ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":5173 " ^| findstr LISTENING') do taskkill /PID %%a /F > nul 2>&1
timeout /t 2 /nobreak > nul

:: 백엔드 실행
echo [2/3] 백엔드 서버 시작 (포트 8002)...
start "KAISER-Backend" cmd /k "cd /d C:\Users\240710P\OneDrive\joy_erp\backend && C:\Users\240710P\OneDrive\joy_erp\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload"
timeout /t 5 /nobreak > nul

:: 프론트엔드 실행 (npm.cmd 사용 - cmd.exe에서는 npm.cmd 필요)
echo [3/3] 프론트엔드 시작 (포트 5173)...
start "KAISER-Frontend" cmd /k "cd /d C:\Users\240710P\OneDrive\joy_erp\frontend && "C:\Program Files\nodejs\npm.cmd" run dev -- --host 0.0.0.0"

echo.
echo ========================================
echo   서버 주소
echo   로컬:  http://localhost:5173
echo   LAN:   http://192.168.0.113:5173
echo ========================================
echo.
echo 브라우저를 여는 중...
timeout /t 6 /nobreak > nul
start http://localhost:5173

echo 실행 완료! 이 창은 닫아도 됩니다.
pause
