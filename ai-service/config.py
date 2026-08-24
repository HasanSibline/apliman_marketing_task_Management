import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class Config:
    """Base configuration"""
    # AI Provider Configuration (Gemini with multiple API keys support)
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    
    @classmethod
    def get_api_keys(cls):
        """Get list of Gemini API keys (supports multiple keys with fallback)"""
        if not hasattr(cls, '_api_keys_cached'):
            keys = []
            
            # Check for multiple keys first (GOOGLE_API_KEYS - comma separated)
            keys_env = os.getenv("GOOGLE_API_KEYS", "")
            if keys_env:
                keys = [key.strip() for key in keys_env.split(",") if key.strip()]
            
            # Fallback to single key (GOOGLE_API_KEY)
            if not keys and cls.GOOGLE_API_KEY:
                keys = [cls.GOOGLE_API_KEY]
            
            cls._api_keys_cached = keys
        
        return cls._api_keys_cached
    
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
    # gemini-2.0-flash was shut down by Google on 2026-06-01, and this default is the
    # live fallback for every provider entry that pins no model of its own, so calls
    # were going to a model that no longer exists. gemini-2.5-flash is Google's
    # documented replacement.
    # NEXT RETIREMENT: gemini-2.5-flash goes the same way on 2026-10-16, successor
    # gemini-3.5-flash. Moving is not automatic, 3.5-flash costs roughly fifteen times
    # as much per token, so the owner decides when the bill changes, not this file.
    GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    # Claude. Requests may override this per-company via the platform "model" setting.
    # Use "claude-haiku-4-5" for the cheapest option.
    ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-opus-5")

    @classmethod
    def validate(cls):
        """Validate required configuration"""
        # Validate environment
        if cls.ENVIRONMENT not in ["development", "production", "testing"]:
            raise ValueError(
                f"Invalid ENVIRONMENT value: {cls.ENVIRONMENT}. "
                "Must be one of: development, production, testing"
            )

        # NOTE: AI API keys are NOT read from the environment. Every AI request must
        # carry a company-specific key assigned via the admin panel. Env keys
        # (GOOGLE_API_KEY / GROQ_API_KEY) are intentionally never used at runtime.

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
