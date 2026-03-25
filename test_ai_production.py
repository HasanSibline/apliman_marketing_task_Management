import requests
import os
from dotenv import load_dotenv
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# PRODUCTION CONFIGURATION
AI_SERVICE_URL = "https://apliman-marketing-task-management.onrender.com"

# SECURITY: These should be provided via environment variables (Recommended)
# or entered manually locally but NEVER pushed to GitHub.
AI_SERVICE_SECRET = os.getenv("AI_SERVICE_SECRET", "ENTER_YOUR_SECRET_HERE")
AI_API_KEY = os.getenv("AI_API_KEY", "ENTER_YOUR_GROQ_OR_GEMINI_KEY_HERE")
AI_PROVIDER = os.getenv("AI_PROVIDER", "groq") # "groq" or "gemini"

def test_task_generation():
    print(f"\n--- Testing Task Generation ({AI_PROVIDER}) ---")
    payload = {
        "title": "Create a social media strategy for a new Oud perfume launch",
        "api_key": AI_API_KEY,
        "provider": AI_PROVIDER
    }
    headers = {
        "Authorization": f"Bearer {AI_SERVICE_SECRET}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(f"{AI_SERVICE_URL}/generate-content", json=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            print(" ✅ SUCCESS: Task content generated!")
            data = response.json()
            print(f" AI Provider Used: {data.get('ai_provider', 'unknown')}")
            print(f" Model Used: {data.get('model', 'unknown')}")
            print(f" Sample Description: {data.get('description', '')[:100]}...")
        elif response.status_code == 401:
            print(" ❌ UNAUTHORIZED: Your AI_SERVICE_SECRET is incorrect.")
        else:
            print(f" ❌ FAILED: Status {response.status_code}")
            print(f" Response: {response.text}")
    except Exception as e:
        print(f" ❌ ERROR: {str(e)}")

def test_aplichat():
    print(f"\n--- Testing ApliChat AI ({AI_PROVIDER}) ---")
    payload = {
        "message": "Hello ApliChat! Tell me something about luxury marketing.",
        "userContext": {"name": "Admin", "role": "COMPANY_ADMIN"},
        "user": {"name": "Test User", "id": "test-123"},
        "api_key": AI_API_KEY,
        "provider": AI_PROVIDER
    }
    headers = {
        "Authorization": f"Bearer {AI_SERVICE_SECRET}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(f"{AI_SERVICE_URL}/chat", json=payload, headers=headers, timeout=30)
        if response.status_code == 200:
            print(" ✅ SUCCESS: Chat response received!")
            data = response.json()
            print(f" Response: {data.get('response', '')[:100]}...")
        else:
            print(f" ❌ FAILED: Status {response.status_code}")
            print(f" Response: {response.text}")
    except Exception as e:
        print(f" ❌ ERROR: {str(e)}")

if __name__ == "__main__":
    print(f"🚀 Starting AI Production Health Check on {AI_SERVICE_URL}...")
    
    if "ENTER_YOUR" in AI_SERVICE_SECRET or "ENTER_YOUR" in AI_API_KEY:
        print("\n⚠️  PLEASE CONFIGURE YOUR KEYS BEFORE RUNNING:")
        print("You can set them as environment variables or edit the script locally (but DO NOT push keys to GitHub).")
    
    test_task_generation()
    test_aplichat()
