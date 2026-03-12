#!/bin/bash

# Install system dependencies
apt-get update && apt-get install -y tesseract-ocr tesseract-ocr-eng

# Install Python dependencies
pip install -r requirements.txt

# Install Playwright browsers for scraping
playwright install chromium
playwright install-deps chromium

# Create models directory
mkdir -p models

echo "✅ AI Service build completed successfully!"
