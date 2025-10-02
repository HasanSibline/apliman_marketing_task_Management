import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration"""
    # AI Provider Configuration
    AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini")  # 'gemini' or 'legacy'
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    LEGACY_AI_KEY = os.getenv("LEGACY_AI_KEY")  # For legacy AI system
    LEGACY_AI_ENDPOINT = os.getenv("LEGACY_AI_ENDPOINT")  # For legacy AI system
    
    # Server Configuration
    PORT = int(os.getenv("PORT", 8001))
    HOST = os.getenv("HOST", "0.0.0.0")
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    ENVIRONMENT = os.getenv("ENVIRONMENT", "production")
    
    # Rate limiting settings
    RATE_LIMIT_REQUESTS = int(os.getenv("RATE_LIMIT_REQUESTS", 60))  # requests per minute
    RATE_LIMIT_INTERVAL = int(os.getenv("RATE_LIMIT_INTERVAL", 60))  # interval in seconds
    
    # Retry settings
    MAX_RETRIES = int(os.getenv("MAX_RETRIES", 3))
    RETRY_DELAY = int(os.getenv("RETRY_DELAY", 1))  # seconds
    
    # Cache settings
    CACHE_ENABLED = os.getenv("CACHE_ENABLED", "true").lower() == "true"
    CACHE_TTL = int(os.getenv("CACHE_TTL", 3600))  # seconds
    
    # AI Model Configuration
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    LEGACY_MODEL = os.getenv("LEGACY_MODEL", "gpt-3.5-turbo")  # For legacy system

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        # Validate environment
        if cls.ENVIRONMENT not in ["development", "production", "testing"]:
            raise ValueError(
                f"Invalid ENVIRONMENT value: {cls.ENVIRONMENT}. "
                "Must be one of: development, production, testing"
            )
        
        # Validate AI provider
        if cls.AI_PROVIDER not in ["gemini", "legacy"]:
            raise ValueError(
                f"Invalid AI_PROVIDER value: {cls.AI_PROVIDER}. "
                "Must be one of: gemini, legacy"
            )
        
        # Validate required API keys based on provider
        if cls.AI_PROVIDER == "gemini" and not cls.GOOGLE_API_KEY:
            raise ValueError(
                "GOOGLE_API_KEY not found in environment variables. "
                "Required when AI_PROVIDER is set to 'gemini'. "
                "Please set it in your .env file or environment variables."
            )
        elif cls.AI_PROVIDER == "legacy":
            if not cls.LEGACY_AI_KEY:
                raise ValueError(
                    "LEGACY_AI_KEY not found in environment variables. "
                    "Required when AI_PROVIDER is set to 'legacy'. "
                    "Please set it in your .env file or environment variables."
                )
            if not cls.LEGACY_AI_ENDPOINT:
                raise ValueError(
                    "LEGACY_AI_ENDPOINT not found in environment variables. "
                    "Required when AI_PROVIDER is set to 'legacy'. "
                    "Please set it in your .env file or environment variables."
                )

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    RELOAD = True
    LOG_LEVEL = "DEBUG"

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    RELOAD = False
    LOG_LEVEL = "WARNING"
    HOST = "0.0.0.0"  # Listen on all interfaces

class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    LOG_LEVEL = "DEBUG"

# Configuration dictionary
config = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
    "testing": TestingConfig,
    "default": ProductionConfig
}

# Get current configuration
def get_config():
    """Get current configuration based on ENVIRONMENT"""
    env = os.getenv("ENVIRONMENT", "production")
    return config.get(env, config["default"])
