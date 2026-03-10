import logging
import aiohttp
from bs4 import BeautifulSoup
from typing import Dict, Optional, List
import asyncio
from urllib.parse import urlparse
import re
from playwright.async_api import async_playwright
from playwright_stealth import stealth_async

logger = logging.getLogger(__name__)

class WebScraperError(Exception):
    """Custom exception for WebScraper errors"""
    pass

class WebScraper:
    """Service for extracting content from websites with JS support"""
    
    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=45) 
        self.max_content_length = 50000  # Max characters to extract
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ]
        
    async def scrape_url(self, url: str) -> Dict[str, any]:
        """
        Scrape content from a URL. Tries fast method first, falls back to browser if needed.
        """
        try:
            # Validate URL
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                raise WebScraperError(f"Invalid URL: {url}")
            
            logger.info(f"🚀 Attempting fast scrape: {url}")
            
            # 1. Try Fast Scrape (aiohttp)
            fast_result = await self._scrape_fast(url)
            
            # 2. Decide if we need deep scrape (Playwright)
            # Conditions for deep scrape:
            # - Fast scrape failed
            # - Content is very short (likely skeleton/SPA)
            # - Common "blocked" markers found
            
            content_len = len(fast_result.get('content', '') or '')
            is_suspiciously_short = content_len < 1000 
            is_blocked = any(m in (fast_result.get('content', '') or '').lower() for m in ['enable javascript', 'access denied', 'please wait...', 'checking your browser'])
            
            if not fast_result.get('success') or is_suspiciously_short or is_blocked:
                logger.info(f"🕵️ Fast scrape insufficient (len={content_len}, blocked={is_blocked}). Switching to Deep Scrape (Playwright)...")
                return await self._scrape_with_playwright(url)
            
            return fast_result

        except Exception as e:
            logger.error(f"❌ Scraping failed at top level: {str(e)}")
            return {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': str(e)
            }

    async def _scrape_fast(self, url: str) -> Dict[str, any]:
        """Fast scrape using aiohttp and BeautifulSoup"""
        try:
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    'User-Agent': self.user_agents[0],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }
                
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        return {'success': False, 'error': f"HTTP {response.status}"}
                    
                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    title = self._extract_title(soup)
                    content = self._extract_content(soup)
                    
                    return {
                        'success': True,
                        'content': content,
                        'title': title,
                        'metadata': {
                            'method': 'fast',
                            'url': url,
                            'content_length': len(content)
                        },
                        'error': None
                    }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _scrape_with_playwright(self, url: str) -> Dict[str, any]:
        """Deep scrape using headless browser (Playwright) to handle JS and anti-bot"""
        async with async_playwright() as p:
            # Use Chromium as it's the most reliable for scraping
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent=self.user_agents[0],
                viewport={'width': 1280, 'height': 800}
            )
            
            # Apply stealth to avoid detection
            page = await context.new_page()
            await stealth_async(page)
            
            try:
                logger.info(f"🌐 Navigating to {url} via Headless Chromium...")
                
                # Navigate and wait for basic network idle
                await page.goto(url, wait_until='networkidle', timeout=45000)
                
                # Small delay for dynamic content to settle
                await asyncio.sleep(2)
                
                # Scroll a bit to trigger lazy loading
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
                await asyncio.sleep(1)
                
                # Extract content
                html = await page.content()
                title = await page.title()
                
                # Use BS4 on the rendered HTML for better cleaning
                soup = BeautifulSoup(html, 'html.parser')
                content = self._extract_content(soup)
                
                logger.info(f"✅ Deep scrape successful: {len(content)} chars")
                
                return {
                    'success': True,
                    'content': content,
                    'title': title,
                    'metadata': {
                        'method': 'deep_playwright',
                        'url': url,
                        'content_length': len(content)
                    },
                    'error': None
                }
            except Exception as e:
                logger.error(f"❌ Deep scrape failed: {str(e)}")
                return {
                    'success': False,
                    'error': f"Browser scraping failed: {str(e)}"
                }
            finally:
                await browser.close()

    def _extract_title(self, soup: BeautifulSoup) -> str:
        if soup.title and soup.title.string:
            return soup.title.string.strip()
        return "Untitled"

    def _extract_content(self, soup: BeautifulSoup) -> str:
        """Extract main content from the page, cleaning up noise"""
        # Remove noisy elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 
                           'aside', 'iframe', 'noscript', 'svg', 'form']):
            element.decompose()
        
        # Priority content areas
        main_content = None
        for selector in ['main', 'article', '[role="main"]', '.content', '#content', '.post-content']:
            main_content = soup.select_one(selector)
            if main_content: break
            
        if not main_content:
            main_content = soup.body if soup.body else soup
            
        # Extract text with separator to preserve block structure
        text = main_content.get_text(separator='\n', strip=True)
        
        # Cleanup
        text = re.sub(r'\n{3,}', '\n\n', text) # Normalize newlines
        text = re.sub(r' +', ' ', text) # Normalize spaces
        
        # Deduplication of lines (common in scraped menus/footers that slipped through)
        lines = text.split('\n')
        unique_lines = []
        seen = set()
        for line in lines:
            trimmed = line.strip()
            if not trimmed: continue
            if trimmed not in seen:
                unique_lines.append(trimmed)
                seen.add(trimmed)
        
        final_text = '\n'.join(unique_lines)
        return final_text[:self.max_content_length]

    async def scrape_multiple(self, urls: List[str]) -> Dict[str, Dict]:
        results = {}
        for url in urls:
            results[url] = await self.scrape_url(url)
        return results

