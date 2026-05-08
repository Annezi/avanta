@echo off
cd /d "%~dp0"
echo Starting AvantaPrint API on http://127.0.0.1:8000
echo Copy .env.example to .env and fill secrets first.
py -3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
