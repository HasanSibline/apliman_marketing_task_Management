import logging
import aiohttp
from bs4 import BeautifulSoup
from typing import Dict, Optional
import asyncio
from urllib.parse import urlparse
import re

logger = logging.getLogger(__name__)

class WebScraperError(Exception):
    """Custom exception for WebScraper errors"""
    pass

class WebScraper:
    """Service for extracting content from websites"""
    
    def __init__(self):
        self.timeout = aiohttp.ClientTimeout(total=30)  # 30 second timeout
        self.max_content_length = 50000  # Max characters to extract
        
    async def scrape_url(self, url: str) -> Dict[str, any]:
        """
        Scrape content from a URL and extract relevant information
        
        Args:
            url: The URL to scrape
            
        Returns:
            Dict containing:
                - content: Extracted text content
                - title: Page title
                - metadata: Additional metadata (description, keywords, etc.)
                - success: Boolean indicating success
                - error: Error message if failed
        """
        try:
            # Validate URL
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                raise WebScraperError(f"Invalid URL: {url}")
            
            logger.info(f"Starting to scrape: {url}")
            
            async with aiohttp.ClientSession(timeout=self.timeout) as session:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                }
                
                async with session.get(url, headers=headers) as response:
                    if response.status != 200:
                        raise WebScraperError(f"HTTP {response.status}: Failed to fetch URL")
                    
                    # Check content type
                    content_type = response.headers.get('Content-Type', '')
                    if 'text/html' not in content_type:
                        raise WebScraperError(f"Unsupported content type: {content_type}")
                    
                    html = await response.text()
                    
                    # Parse HTML
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    # Extract metadata
                    title = self._extract_title(soup)
                    description = self._extract_description(soup)
                    keywords = self._extract_keywords(soup)
                    
                    # Extract main content
                    content = self._extract_content(soup)
                    
                    # Truncate if too long
                    if len(content) > self.max_content_length:
                        content = content[:self.max_content_length] + "..."
                        logger.warning(f"Content truncated to {self.max_content_length} characters")
                    
                    logger.info(f"Successfully scraped {len(content)} characters from {url}")
                    
                    return {
                        'success': True,
                        'content': content,
                        'title': title,
                        'metadata': {
                            'description': description,
                            'keywords': keywords,
                            'url': url,
                            'content_length': len(content)
                        },
                        'error': None
                    }
                    
        except aiohttp.ClientError as e:
            error_msg = f"Network error: {str(e)}"
            logger.error(f"Failed to scrape {url}: {error_msg}")
            return {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': error_msg
            }
        except WebScraperError as e:
            logger.error(f"Scraping error for {url}: {str(e)}")
            return {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': str(e)
            }
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            logger.error(f"Failed to scrape {url}: {error_msg}")
            return {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': error_msg
            }
    
    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract page title"""
        # Try <title> tag
        if soup.title and soup.title.string:
            return soup.title.string.strip()
        
        # Try og:title meta tag
        og_title = soup.find('meta', property='og:title')
        if og_title and og_title.get('content'):
            return og_title['content'].strip()
        
        # Try first h1
        h1 = soup.find('h1')
        if h1:
            return h1.get_text().strip()
        
        return "Untitled"
    
    def _extract_description(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract page description"""
        # Try meta description
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            return meta_desc['content'].strip()
        
        # Try og:description
        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            return og_desc['content'].strip()
        
        # Try first paragraph
        p = soup.find('p')
        if p:
            text = p.get_text().strip()
            if len(text) > 50:
                return text[:200] + "..." if len(text) > 200 else text
        
        return None
    
    def _extract_keywords(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract keywords"""
        meta_keywords = soup.find('meta', attrs={'name': 'keywords'})
        if meta_keywords and meta_keywords.get('content'):
            return meta_keywords['content'].strip()
        return None
    
    def _extract_content(self, soup: BeautifulSoup) -> str:
        """
        Extract main content from the page
        This removes scripts, styles, navigation, etc.
        """
        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 
                           'aside', 'iframe', 'noscript']):
            element.decompose()
        
        # Try to find main content area
        main_content = None
        
        # Look for common content containers
        for selector in ['main', 'article', '[role="main"]', '.content', 
                        '#content', '.main-content', '#main-content']:
            main_content = soup.select_one(selector)
            if main_content:
                break
        
        # If no main content found, use body
        if not main_content:
            main_content = soup.body if soup.body else soup
        
        # Extract text
        text = main_content.get_text(separator='\n', strip=True)
        
        # Clean up text
        text = self._clean_text(text)
        
        return text
    
    def _clean_text(self, text: str) -> str:
        """Clean extracted text"""
        # Remove multiple newlines
        text = re.sub(r'\n\s*\n', '\n\n', text)
        
        # Remove excessive whitespace
        text = re.sub(r' +', ' ', text)
        
        # Remove lines with just whitespace
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        return '\n'.join(lines)
    
    async def scrape_multiple(self, urls: list) -> Dict[str, Dict]:
        """
        Scrape multiple URLs concurrently
        
        Args:
            urls: List of URLs to scrape
            
        Returns:
            Dict mapping URL to scraping results
        """
        tasks = [self.scrape_url(url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        return {
            url: result if not isinstance(result, Exception) else {
                'success': False,
                'content': None,
                'title': None,
                'metadata': None,
                'error': str(result)
            }
            for url, result in zip(urls, results)
        }

