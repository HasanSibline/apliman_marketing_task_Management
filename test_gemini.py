import aiohttp
import asyncio
import json
import os

async def test_gemini():
    api_key = "AIzaSyBlMmpWp0EeZnb4D0NECDeP073DPGodhso" # From ai-service/.env
    # Note: If this is a placeholder, it will fail with 400 or 401.
    
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
    headers = {
        "Content-Type": "application/json",
        "X-goog-api-key": api_key
    }
    payload = {
        "contents": [{"parts": [{"text": "Hello, how are you?"}]}]
    }
    
    print(f"Testing URL: {url}")
    print(f"Using Header Auth: X-goog-api-key: {api_key[:5]}...{api_key[-5:]}")
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, headers=headers, json=payload) as response:
                print(f"Status: {response.status}")
                text = await response.text()
                print(f"Response: {text}")
                
            # Try with query param auth as well to see if it makes a difference
            url_query = f"{url}?key={api_key}"
            print(f"\nTesting URL with query param auth: {url_query[:60]}...")
            async with session.post(url_query, headers={"Content-Type": "application/json"}, json=payload) as response:
                print(f"Status: {response.status}")
                text = await response.text()
                print(f"Response: {text}")
                
    except Exception as e:
        print(f"Error: {str(e)}")

if __name__ == "__main__":
    asyncio.run(test_gemini())
