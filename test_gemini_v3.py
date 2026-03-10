import aiohttp
import asyncio
import json

async def test_gemini():
    # Attempt with the other key from .env
    api_key = "AIzaSyBlMmpWp0EeZnb4D0NECDeP073DPGodhso"
    
    model = "gemini-3-flash-preview"
    
    payload = {
        "contents": [{"parts": [{"text": "Hello, how are you?"}]}]
    }
    
    async with aiohttp.ClientSession() as session:
        print(f"\n--- Testing Model: {model} with Key: {api_key[:10]}... ---")
        
        # Method 2: Query Param (?key=...) - often more reliable for REST
        url_query = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        print(f"Testing with Query Param Auth...")
        try:
            async with session.post(url_query, headers={"Content-Type": "application/json"}, json=payload) as response:
                status = response.status
                text = await response.text()
                print(f"Status: {status}")
                if status == 200:
                    print("✅ Success!")
                    print(text[:200])
                else:
                    print(f"❌ Failed: {text[:200]}")
        except Exception as e:
            print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
