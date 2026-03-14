#!/bin/bash

# Install system dependencies
apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-eng

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers for scraping
# Explicitly set the path for Render environments
export PLAYWRIGHT_BROWSERS_PATH=/opt/render/.cache/ms-playwright
python -m playwright install chromium
python -m playwright install-deps chromium

# Create models directory
mkdir -p models

echo "✅ AI Service build completed successfully!"
