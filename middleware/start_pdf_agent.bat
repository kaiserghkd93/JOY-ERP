@echo off
chcp 65001 >nul
title JOY-ERP PDF 로컬 에이전트
cd /d %~dp0

echo [PDF 에이전트] 시작 중...
echo.

REM 필요 패키지 자동 설치
pip install fastapi uvicorn requests python-dotenv --quiet

echo.
python pdf_agent.py

pause
