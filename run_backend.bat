@echo off
cd /d C:\Users\240710P\OneDrive\joy_erp\backend
C:\Users\240710P\OneDrive\joy_erp\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
