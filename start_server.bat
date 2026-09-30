@echo off
cd /d C:\Users\240710P\OneDrive\joy_erp\backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
pause
