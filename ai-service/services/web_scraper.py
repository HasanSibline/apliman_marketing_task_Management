import logging
import os
import aiohttp
from bs4 import BeautifulSoup
from typing import Dict, Optional, List
import asyncio
from urllib.parse import urlparse
import re
from playwright.async_api import async_playwright
# playwright_stealth imported lazily inside method to handle version differences
import subprocess

logger = logging.getLogger(__name__)

class WebScraperError(Exception):
    """Custom exception for WebScraper errors"""
    pass

class WebScraper:
    """Service for extracting content from websites with JS support"""
    
    # Time budget. The backend gives up on a scrape after 90 seconds, so everything here
    # finishes well inside that: a quick plain fetch, then at most one bounded browser
    # attempt. Before this, the plain fetch alone could take 45 s and the browser waited
    # for "network idle", which many sites never reach (analytics, chat widgets, live
    # connections), so a single source routinely ran past 90 s and came back as a 504.
    FAST_TIMEOUT_S = 15
    BROWSER_BUDGET_S = 35
    MIN_GOOD_CONTENT = 1000   # below this a page is probably a JS shell worth rendering
    MIN_USABLE_CONTENT = 50   # below this the plain fetch is not worth keeping as a fallback

    # One headless browser at a time. Each Chromium takes a few hundred MB, and two at once
    # on a small instance can take the whole service down with it.
    _browser_slot = asyncio.Semaphore(1)
    _browser_installed_checked = False

    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=self.FAST_TIMEOUT_S)
        self.max_content_length = 50000  # Max characters to extract
        self.user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        ]

    async def scrape_url(self, url: str) -> Dict[str, any]:
        """
        Scrape content from a URL: a plain fetch first, a headless browser only if the
        page looks like it needs JavaScript, and the plain fetch's text if the browser fails.
        """
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                raise WebScraperError(f"Invalid URL: {url}")

            logger.info(f"Attempting fast scrape: {url}")
            fast_result = await self._scrape_fast(url)

            content = fast_result.get('content', '') or ''
            is_blocked = any(m in content.lower() for m in ['enable javascript', 'access denied', 'please wait...', 'checking your browser'])
            if fast_result.get('success') and len(content) >= self.MIN_GOOD_CONTENT and not is_blocked:
                return fast_result

            logger.info(f"Fast scrape insufficient (len={len(content)}, blocked={is_blocked}); trying the browser")
            try:
                deep = await asyncio.wait_for(self._scrape_with_playwright(url), timeout=self.BROWSER_BUDGET_S)
            except asyncio.TimeoutError:
                deep = {'success': False, 'error': f"The page did not finish loading within {self.BROWSER_BUDGET_S} seconds"}
            except Exception as e:  # a browser that cannot start must not lose the plain text
                deep = {'success': False, 'error': f"Browser scraping failed: {e}"}

            if deep.get('success') and len(deep.get('content') or '') >= len(content):
                return deep

            # The browser failed or found less. Keep what the plain fetch read, if it is
            # worth anything, rather than reporting a failure for a page we did read.
            if fast_result.get('success') and len(content) >= self.MIN_USABLE_CONTENT and not is_blocked:
                fast_result['metadata']['browser_fallback'] = deep.get('error') or 'browser found less text'
                return fast_result

            return {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': deep.get('error') or fast_result.get('error') or 'No readable text was found on the page',
            }

        except Exception as e:
            logger.error(f"Scraping failed at top level: {str(e)}")
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
                        return {'success': False, 'error': f"The site answered HTTP {response.status}"}

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
        except asyncio.TimeoutError:
            return {'success': False, 'error': f"The site did not answer within {self.FAST_TIMEOUT_S} seconds"}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def _launch(self, p):
        """Start Chromium, installing it once if this instance does not have it yet."""
        args = ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu']
        try:
            return await p.chromium.launch(headless=True, args=args)
        except Exception as e:
            if "Executable doesn't exist" not in str(e) or WebScraper._browser_installed_checked:
                raise
            # Installing on every request, as this used to, cost seconds each time. Only a
            # missing browser is worth the install, and only once per process.
            WebScraper._browser_installed_checked = True
            logger.warning("Chromium missing; installing it once")
            await asyncio.to_thread(
                subprocess.run, ["playwright", "install", "chromium"],
                check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            )
            return await p.chromium.launch(headless=True, args=args)

    async def _scrape_with_playwright(self, url: str) -> Dict[str, any]:
        """Render the page in a headless browser for sites that need JavaScript."""
        async with WebScraper._browser_slot:
            async with async_playwright() as p:
                browser = await self._launch(p)
                try:
                    context = await browser.new_context(
                        user_agent=self.user_agents[0],
                        viewport={'width': 1280, 'height': 800}
                    )
                    page = await context.new_page()

                    # Text is all we keep, so images, media and fonts are never fetched.
                    async def skip_heavy(route):
                        if route.request.resource_type in ('image', 'media', 'font'):
                            await route.abort()
                        else:
                            await route.continue_()
                    await page.route("**/*", skip_heavy)

                    try:
                        from playwright_stealth import stealth_async as _stealth_async
                        await _stealth_async(page)
                    except (ImportError, AttributeError):
                        try:
                            from playwright_stealth import Stealth
                            await Stealth().apply_stealth_async(page)
                        except Exception:
                            logger.warning("playwright_stealth not available or incompatible - skipping stealth mode")

                    logger.info(f"Navigating to {url} via headless Chromium")
                    # The document, not "network idle": idle never comes on pages that keep
                    # a connection open. A short, optional wait lets scripts fill content in.
                    await page.goto(url, wait_until='domcontentloaded', timeout=20000)
                    try:
                        await page.wait_for_load_state('networkidle', timeout=5000)
                    except Exception:
                        pass
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
                    await asyncio.sleep(1)

                    html = await page.content()
                    title = await page.title()
                    content = self._extract_content(BeautifulSoup(html, 'html.parser'))
                    logger.info(f"Deep scrape successful: {len(content)} chars")

                    return {
                        'success': bool(content),
                        'content': content,
                        'title': title,
                        'metadata': {
                            'method': 'deep_playwright',
                            'url': url,
                            'content_length': len(content)
                        },
                        'error': None if content else 'The page rendered but had no readable text',
                    }
                except Exception as e:
                    logger.error(f"Deep scrape failed: {str(e)}")
                    return {'success': False, 'error': f"Browser scraping failed: {str(e)}"}
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

