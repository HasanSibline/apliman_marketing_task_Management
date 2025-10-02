@echo off
echo Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python first.
    exit /b 1
)

echo Checking pip installation...
pip --version >nul 2>&1
if errorlevel 1 (
    echo pip is not installed. Please install pip first.
    exit /b 1
)

if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)

echo Activating virtual environment...
call venv\Scripts\activate.bat

echo Upgrading pip...
python -m pip install --upgrade pip

echo Installing requirements...
pip install -r requirements.txt

if not exist .env (
    echo Creating .env file...
    echo GOOGLE_API_KEY=gen-lang-client-0151424356> .env
    echo PORT=8001>> .env
    echo ENVIRONMENT=development>> .env
)

echo Starting AI service...
python main.py
