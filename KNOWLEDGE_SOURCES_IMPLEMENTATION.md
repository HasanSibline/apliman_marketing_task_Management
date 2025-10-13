# Knowledge Sources Implementation

## Overview
This implementation enhances Gemini AI's ability to generate high-quality content for tasks related to Apliman's services by providing it with multiple sources for better knowledge and competitive analysis.

## Features Implemented

### 1. Database Schema
- **New Model: `KnowledgeSource`**
  - Stores multiple URLs (Apliman and competitor sources)
  - Fields:
    - `name`: Display name for the source
    - `url`: URL to scrape content from
    - `type`: Either `APLIMAN` or `COMPETITOR`
    - `description`: Optional description
    - `isActive`: Can be enabled/disabled
    - `content`: Extracted content from URL
    - `lastScraped`: Timestamp of last scraping
    - `scrapingError`: Error message if scraping failed
    - `priority`: Priority level (1-5) for ordering sources
    - `metadata`: Additional metadata (title, keywords, etc.)

### 2. Web Scraping Service (Python)
- **File: `ai-service/services/web_scraper.py`**
- Features:
  - Extracts content from websites
  - Removes navigation, scripts, styles, and other non-content elements
  - Extracts title, description, and keywords
  - Handles errors gracefully
  - Supports concurrent scraping of multiple URLs
  - Truncates content to prevent token limit issues

### 3. Backend API Endpoints
- **Module: `backend/src/knowledge`**
- Endpoints:
  - `GET /knowledge-sources` - List all knowledge sources (Admin only)
  - `GET /knowledge-sources/active` - Get active sources
  - `GET /knowledge-sources/:id` - Get single source
  - `POST /knowledge-sources` - Create new source (Admin only)
  - `PUT /knowledge-sources/:id` - Update source (Admin only)
  - `DELETE /knowledge-sources/:id` - Delete source (Admin only)
  - `POST /knowledge-sources/:id/scrape` - Scrape single source (Admin only)
  - `POST /knowledge-sources/scrape-all` - Scrape all active sources (Admin only)

### 4. Enhanced Content Generation
- **Updated Files:**
  - `ai-service/services/content_generator.py`
  - `backend/src/ai/ai.service.ts`
  - `ai-service/main.py`

- **How it Works:**
  1. When generating content, the system fetches all active knowledge sources
  2. Knowledge sources are passed to the Python AI service
  3. The content generator builds an enhanced system prompt that includes:
     - **Apliman Knowledge Base**: Content from all Apliman URLs
     - **Competitive Analysis**: Content from competitor URLs
  4. Gemini AI uses this enriched context to generate:
     - More accurate content about Apliman's products and services
     - Content that highlights Apliman's competitive advantages
     - Better strategic positioning in the market

### 5. Competitive Analysis
- **Implementation:**
  - When competitor sources are provided, the AI:
    - Analyzes competitor offerings
    - Compares with Apliman's services
    - Generates content that subtly highlights Apliman's advantages
    - Focuses on unique value propositions without directly attacking competitors

### 6. Frontend Admin Interface
- **Page: `frontend/src/pages/admin/KnowledgeSourcesPage.tsx`**
- Features:
  - View all knowledge sources
  - Add new sources (Apliman or Competitor)
  - Edit existing sources
  - Delete sources
  - Enable/disable sources
  - Set priority levels (1-5)
  - Scrape individual sources
  - Scrape all sources at once
  - View scraping status and errors
  - See last scraped timestamp
  - View content length

- **Access:** Admin only, accessible via sidebar navigation

## Usage Guide

### For Administrators

#### Adding Knowledge Sources

1. **Navigate to Knowledge Sources**
   - Log in as Admin or Super Admin
   - Click "Knowledge Sources" in the sidebar

2. **Add Apliman URLs**
   - Click "Add Source" button
   - Fill in the form:
     - Name: e.g., "Apliman Main Website"
     - URL: https://www.apliman.com
     - Type: Select "Apliman"
     - Description: Optional description
     - Priority: 1-5 (higher = more important)
     - Active: Check to enable
   - Click "Create"

3. **Add Competitor URLs**
   - Same process as above
   - Select "Competitor" as the type
   - Add as many competitor URLs as needed

4. **Scraping Content**
   - Content is automatically scraped when you add a source
   - To manually re-scrape:
     - Click the refresh icon next to a source
     - Or click "Scrape All" to update all sources

### For Content Generation

Once knowledge sources are configured, they automatically enhance all AI content generation:

1. **Creating Tasks**
   - When creating a new task with AI assistance
   - The AI will use knowledge from all active sources

2. **Generating Subtasks**
   - Subtask generation will leverage the knowledge base
   - Content will reflect Apliman's positioning

3. **Content Quality**
   - More accurate product information
   - Better competitive positioning
   - Industry-specific terminology
   - Strategic advantages highlighted

## Technical Details

### Content Truncation
- Apliman sources: Truncated to 3000 characters per source
- Competitor sources: Truncated to 2000 characters per source
- This prevents exceeding Gemini's token limits

### Priority System
Sources are ordered by priority (1-5):
- 5 = Highest priority (most important sources)
- 1 = Lowest priority

Higher priority sources appear first in the AI prompt.

### Error Handling
- If scraping fails, the error is logged
- The source remains in the database
- Previous content (if any) is retained
- Users can retry scraping manually

### Performance
- Scraping is asynchronous
- Multiple sources can be scraped concurrently
- Scraping doesn't block content generation
- Sources can be used even while being updated

## Migration

To apply the database changes:

```bash
cd backend
npx prisma migrate dev
```

## Dependencies Added

### Python (ai-service/requirements.txt)
- `beautifulsoup4==4.12.2` - HTML parsing
- `lxml==4.9.3` - XML/HTML processing

## Security Considerations

1. **Admin-Only Access**
   - Only Super Admins and Admins can manage knowledge sources
   - Regular users cannot view or edit sources

2. **URL Validation**
   - URLs are validated before scraping
   - Only HTTP/HTTPS protocols are supported

3. **Content Sanitization**
   - Scripts and styles are removed
   - Only text content is extracted

## Future Enhancements

Potential improvements:
1. Scheduled automatic re-scraping
2. Content versioning (track changes over time)
3. AI-powered content summarization
4. Duplicate content detection
5. RSS feed support
6. API key management for private sources
7. Content freshness indicators
8. Source health monitoring

## Troubleshooting

### Scraping Fails
- Check if the URL is accessible
- Verify the website doesn't block scraping
- Check for HTTPS/SSL issues
- Ensure the AI service is running

### Content Not Appearing in AI Generation
- Verify sources are marked as "Active"
- Check if content was successfully scraped
- Ensure AI service can access the database
- Check AI service logs for errors

### Permission Errors
- Verify user has Admin or Super Admin role
- Check JWT token is valid
- Ensure proper authentication headers

## API Examples

### Create a Knowledge Source
```bash
curl -X POST http://localhost:3000/knowledge-sources \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Apliman Main Site",
    "url": "https://www.apliman.com",
    "type": "APLIMAN",
    "description": "Main Apliman website",
    "priority": 5,
    "isActive": true
  }'
```

### Scrape a Source
```bash
curl -X POST http://localhost:3000/knowledge-sources/{id}/scrape \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get All Active Sources
```bash
curl -X GET http://localhost:3000/knowledge-sources/active \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Conclusion

This implementation provides a robust foundation for enhancing AI content generation with dynamic knowledge sources. Administrators can easily manage multiple information sources, and the AI automatically uses this enriched knowledge to generate higher-quality, more strategically positioned content for Apliman.

