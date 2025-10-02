import os
import sys
import subprocess
import platform
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def check_python():
    """Check Python version"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        logger.error("Python 3.8 or higher is required")
        sys.exit(1)
    logger.info(f"Python {version.major}.{version.minor}.{version.micro} detected")

def setup_virtualenv():
    """Setup virtual environment"""
    venv_path = Path("venv")
    if not venv_path.exists():
        logger.info("Creating virtual environment...")
        subprocess.run([sys.executable, "-m", "venv", "venv"], check=True)
    
    # Activate virtual environment
    if platform.system() == "Windows":
        activate_script = venv_path / "Scripts" / "activate.bat"
        activate_cmd = str(activate_script)
    else:
        activate_script = venv_path / "bin" / "activate"
        activate_cmd = f"source {activate_script}"
    
    logger.info("Activating virtual environment...")
    if platform.system() == "Windows":
        subprocess.run(activate_cmd, shell=True, check=True)
    else:
        os.system(f'. "{activate_script}"')

def install_requirements():
    """Install required packages"""
    logger.info("Installing/upgrading pip...")
    subprocess.run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"], check=True)
    
    logger.info("Installing requirements...")
    subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)

def setup_env():
    """Setup environment files"""
    env_file = Path(".env")
    if not env_file.exists():
        logger.info("Creating .env file...")
        env_content = """GOOGLE_API_KEY=gen-lang-client-0151424356
ENVIRONMENT=production
PORT=8001
HOST=0.0.0.0
LOG_LEVEL=WARNING
RATE_LIMIT_REQUESTS=60
RATE_LIMIT_INTERVAL=60
MAX_RETRIES=3
RETRY_DELAY=1
CACHE_ENABLED=true
CACHE_TTL=3600"""
        env_file.write_text(env_content)

def check_dependencies():
    """Check if all required system dependencies are installed"""
    try:
        import google.generativeai
        import fastapi
        import uvicorn
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        logger.info("Installing requirements...")
        install_requirements()

def start_service():
    """Start the AI service"""
    try:
        # Import configuration
        from config import get_config
        config = get_config()
        
        # Validate configuration
        config.validate()
        
        # Start the service
        logger.info(f"Starting AI service in {config.ENVIRONMENT} mode...")
        import uvicorn
        uvicorn.run(
            "main:app",
            host=config.HOST,
            port=config.PORT,
            reload=config.ENVIRONMENT == "development",
            log_level=config.LOG_LEVEL.lower(),
            workers=4 if config.ENVIRONMENT == "production" else 1
        )
    except Exception as e:
        logger.error(f"Failed to start service: {e}")
        sys.exit(1)

def main():
    """Main entry point"""
    try:
        logger.info("Starting setup...")
        check_python()
        setup_virtualenv()
        setup_env()
        check_dependencies()
        start_service()
    except Exception as e:
        logger.error(f"Setup failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
