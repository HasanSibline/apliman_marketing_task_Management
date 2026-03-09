import aiohttp
import asyncio
import json

async def test_gemini():
    # Key provided by user
    api_key = "AIzaSyBj5gXQbXV7L_wgfQ8vIr5ziojhaRK7RbA"
    
    models = [
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-3-flash-preview"
    ]
    
    payload = {
        "contents": [{"parts": [{"text": "Hello, how are you?"}]}]
    }
    
    async with aiohttp.ClientSession() as session:
        for model in models:
            print(f"\n--- Testing Model: {model} ---")
            
            # Method 1: Header (X-goog-api-key)
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            headers = {
                "Content-Type": "application/json",
                "X-goog-api-key": api_key
            }
            
            print(f"Testing with Header Auth...")
            try:
                async with session.post(url, headers=headers, json=payload) as response:
                    status = response.status
                    text = await response.text()
                    print(f"Status: {status}")
                    if status == 200:
                        print("✅ Success!")
                    else:
                        print(f"❌ Failed: {text[:200]}")
            except Exception as e:
                print(f"Error: {str(e)}")

            # Method 2: Query Param (?key=...)
            url_query = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            print(f"Testing with Query Param Auth...")
            try:
                async with session.post(url_query, headers={"Content-Type": "application/json"}, json=payload) as response:
                    status = response.status
                    text = await response.text()
                    print(f"Status: {status}")
                    if status == 200:
                        print("✅ Success!")
                    else:
                        print(f"❌ Failed: {text[:200]}")
            except Exception as e:
                print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
