import asyncio
import logging
import os
from typing import Dict, Any, List
from PIL import Image
import pytesseract
import PyPDF2
import io

logger = logging.getLogger(__name__)

class TextExtractorService:
    def __init__(self):
        self.supported_image_types = [
            'image/jpeg', 'image/jpg', 'image/png', 
            'image/gif', 'image/bmp', 'image/tiff'
        ]
        self.supported_document_types = [
            'application/pdf', 'text/plain'
        ]
        
        # Configure Tesseract if available
        self.tesseract_available = self._check_tesseract_availability()
    
    def _check_tesseract_availability(self) -> bool:
        """Check if Tesseract OCR is available"""
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception as e:
            logger.warning(f"Tesseract not available: {str(e)}")
            return False
    
    async def extract(self, file_path: str, mime_type: str) -> Dict[str, Any]:
        """Extract text from file based on mime type"""
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"File not found: {file_path}")
            
            if mime_type in self.supported_image_types:
                return await self._extract_from_image(file_path)
            elif mime_type in self.supported_document_types:
                return await self._extract_from_document(file_path, mime_type)
            else:
                return {
                    'extracted_text': f'Unsupported file type: {mime_type}',
                    'confidence': 0.0
                }
                
        except Exception as e:
            logger.error(f"Error extracting text from {file_path}: {str(e)}")
            return {
                'extracted_text': f'Error extracting text: {str(e)}',
                'confidence': 0.0
            }
    
    async def _extract_from_image(self, file_path: str) -> Dict[str, Any]:
        """Extract text from image using OCR"""
        if not self.tesseract_available:
            return {
                'extracted_text': 'OCR service not available',
                'confidence': 0.0
            }
        
        try:
            loop = asyncio.get_event_loop()
            
            def _ocr_extract():
                # Open and preprocess image
                image = Image.open(file_path)
                
                # Convert to RGB if necessary
                if image.mode != 'RGB':
                    image = image.convert('RGB')
                
                # Extract text using Tesseract
                extracted_text = pytesseract.image_to_string(
                    image,
                    config='--psm 6'  # Assume uniform block of text
                )
                
                # Get confidence data
                data = pytesseract.image_to_data(
                    image, 
                    output_type=pytesseract.Output.DICT,
                    config='--psm 6'
                )
                
                # Calculate average confidence
                confidences = [int(conf) for conf in data['conf'] if int(conf) > 0]
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                
                return extracted_text.strip(), avg_confidence / 100.0
            
            text, confidence = await loop.run_in_executor(None, _ocr_extract)
            
            return {
                'extracted_text': text if text else 'No text found in image',
                'confidence': confidence
            }
            
        except Exception as e:
            logger.error(f"Error in OCR extraction: {str(e)}")
            return {
                'extracted_text': f'OCR extraction failed: {str(e)}',
                'confidence': 0.0
            }
    
    async def _extract_from_document(self, file_path: str, mime_type: str) -> Dict[str, Any]:
        """Extract text from document files"""
        try:
            if mime_type == 'application/pdf':
                return await self._extract_from_pdf(file_path)
            elif mime_type == 'text/plain':
                return await self._extract_from_text(file_path)
            else:
                return {
                    'extracted_text': f'Unsupported document type: {mime_type}',
                    'confidence': 0.0
                }
                
        except Exception as e:
            logger.error(f"Error extracting from document: {str(e)}")
            return {
                'extracted_text': f'Document extraction failed: {str(e)}',
                'confidence': 0.0
            }
    
    async def _extract_from_pdf(self, file_path: str) -> Dict[str, Any]:
        """Extract text from PDF file"""
        try:
            loop = asyncio.get_event_loop()
            
            def _pdf_extract():
                text_content = []
                
                with open(file_path, 'rb') as file:
                    pdf_reader = PyPDF2.PdfReader(file)
                    
                    for page_num, page in enumerate(pdf_reader.pages):
                        try:
                            page_text = page.extract_text()
                            if page_text.strip():
                                text_content.append(page_text)
                        except Exception as e:
                            logger.warning(f"Error extracting page {page_num}: {str(e)}")
                            continue
                
                return '\n\n'.join(text_content)
            
            extracted_text = await loop.run_in_executor(None, _pdf_extract)
            
            # Calculate confidence based on text quality
            confidence = self._calculate_text_confidence(extracted_text)
            
            return {
                'extracted_text': extracted_text if extracted_text.strip() else 'No text found in PDF',
                'confidence': confidence
            }
            
        except Exception as e:
            logger.error(f"Error extracting from PDF: {str(e)}")
            return {
                'extracted_text': f'PDF extraction failed: {str(e)}',
                'confidence': 0.0
            }
    
    async def _extract_from_text(self, file_path: str) -> Dict[str, Any]:
        """Extract text from plain text file"""
        try:
            loop = asyncio.get_event_loop()
            
            def _text_extract():
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                    return file.read()
            
            extracted_text = await loop.run_in_executor(None, _text_extract)
            
            return {
                'extracted_text': extracted_text,
                'confidence': 1.0  # Plain text has perfect confidence
            }
            
        except Exception as e:
            logger.error(f"Error reading text file: {str(e)}")
            return {
                'extracted_text': f'Text file reading failed: {str(e)}',
                'confidence': 0.0
            }
    
    def _calculate_text_confidence(self, text: str) -> float:
        """Calculate confidence score for extracted text"""
        if not text or not text.strip():
            return 0.0
        
        # Basic heuristics for text quality
        total_chars = len(text)
        if total_chars == 0:
            return 0.0
        
        # Count readable characters
        readable_chars = sum(1 for c in text if c.isalnum() or c.isspace() or c in '.,!?;:-()[]{}')
        readable_ratio = readable_chars / total_chars
        
        # Count words vs total characters
        words = text.split()
        if len(words) == 0:
            return 0.0
        
        avg_word_length = sum(len(word) for word in words) / len(words)
        
        # Reasonable word length indicates good extraction
        word_quality = 1.0 if 2 <= avg_word_length <= 12 else 0.5
        
        # Combine factors
        confidence = readable_ratio * word_quality
        
        return min(confidence, 1.0)
    
    def get_supported_types(self) -> Dict[str, List[str]]:
        """Get supported file types"""
        return {
            'images': self.supported_image_types,
            'documents': self.supported_document_types,
            'ocr_available': self.tesseract_available
        }
    
    def get_service_info(self) -> dict:
        """Get information about the text extractor service"""
        return {
            "service_name": "TextExtractorService",
            "available": True,
            "tesseract_available": self.tesseract_available,
            "supported_types": self.get_supported_types()
        }
