import uvicorn
import logging
import sys
from pathlib import Path
from config import get_config

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('ai_service.log')
    ]
)
logger = logging.getLogger("ai_service")

def validate_environment():
    """Validate environment setup"""
    try:
        # Check .env file exists
        env_path = Path('.env')
        if not env_path.exists():
            raise FileNotFoundError(".env file not found. Please create one with required configuration.")

        # Get and validate configuration
        config = get_config()
        config.validate()
        
        return config
    except Exception as e:
        logger.error(f"Environment validation failed: {e}")
        sys.exit(1)

def start_server():
    """Start the AI service server"""
    try:
        logger.info("Starting AI service...")
        
        # Validate environment
        config = validate_environment()
        
        # Log configuration
        logger.info(f"Environment: {config.ENVIRONMENT}")
        logger.info(f"Host: {config.HOST}")
        logger.info(f"Port: {config.PORT}")
        logger.info(f"Log Level: {config.LOG_LEVEL}")
        
        # Start server
        uvicorn.run(
            "main:app",
            host=config.HOST,
            port=config.PORT,
            reload=config.ENVIRONMENT == "development",
            log_level=config.LOG_LEVEL.lower(),
            workers=1 if config.ENVIRONMENT == "development" else 4,
            access_log=True,
            proxy_headers=True,
            forwarded_allow_ips="*",
        )
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    start_server()
