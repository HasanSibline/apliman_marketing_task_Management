import asyncio
import logging
from typing import Optional
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import torch
import accelerate

logger = logging.getLogger(__name__)

class SummarizationService:
    def __init__(self):
        self.model_name = "google/flan-t5-small"  # Using smaller model for faster inference
        self.tokenizer = None
        self.model = None
        self.pipeline = None
        self.max_input_length = 128  # Further reduced for memory efficiency
        self.device = "cpu"  # Force CPU to save memory
        self.model_loaded = False
        
    async def load_model(self):
        """Load the summarization model asynchronously"""
        try:
            logger.info(f"Loading summarization model: {self.model_name}")
            
            # Load in a separate thread to avoid blocking
            loop = asyncio.get_event_loop()
            
            def _load_model():
                tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                model = AutoModelForSeq2SeqLM.from_pretrained(
                    self.model_name,
                    torch_dtype=torch.float16,  # Use half precision to save memory
                    device_map="auto"  # Use accelerate for better memory management
                )
                
                # Create pipeline
                pipe = pipeline(
                    "text2text-generation",
                    model=model,
                    tokenizer=tokenizer,
                    device_map="auto",
                    max_length=512,
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.9
                )
                
                return tokenizer, model, pipe
            
            self.tokenizer, self.model, self.pipeline = await loop.run_in_executor(
                None, _load_model
            )
            
            logger.info("✅ Summarization model loaded successfully")
            self.model_loaded = True
            
        except Exception as e:
            logger.error(f"❌ Failed to load summarization model: {str(e)}")
            logger.warning("Using fallback summarization (simple text truncation)")
            # Set up fallback mode
            self.model = None
            self.tokenizer = None
            self.pipeline = None
    
    async def summarize(self, text: str, max_length: int = 150) -> str:
        """Summarize the given text"""
        if not self.model_loaded:
            # Use fallback summarization
            return self._fallback_summarize(text, max_length)
        
        try:
            # Preprocess text
            text = self._preprocess_text(text)
            
            # Create prompt for Flan-T5
            prompt = f"Summarize the following text in a concise manner: {text}"
            
            # Truncate if too long
            if len(prompt) > self.max_input_length:
                prompt = prompt[:self.max_input_length - 50] + "..."
            
            # Generate summary in a separate thread
            loop = asyncio.get_event_loop()
            
            def _generate_summary():
                result = self.pipeline(
                    prompt,
                    max_length=min(max_length, 200),
                    min_length=min(30, max_length // 3),
                    do_sample=True,
                    temperature=0.7,
                    top_p=0.9,
                    repetition_penalty=1.2
                )
                return result[0]['generated_text']
            
            summary = await loop.run_in_executor(None, _generate_summary)
            
            # Post-process summary
            summary = self._postprocess_summary(summary, text)
            
            logger.info(f"Generated summary: {len(text)} -> {len(summary)} characters")
            return summary
            
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            # Fallback to simple truncation
            return self._fallback_summary(text, max_length)
    
    def _preprocess_text(self, text: str) -> str:
        """Clean and preprocess the input text"""
        # Remove excessive whitespace
        text = ' '.join(text.split())
        
        # Remove special characters that might confuse the model
        text = text.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
        
        return text.strip()
    
    def _postprocess_summary(self, summary: str, original_text: str) -> str:
        """Clean and validate the generated summary"""
        # Remove any artifacts from the generation
        summary = summary.strip()
        
        # Ensure it ends with proper punctuation
        if summary and not summary[-1] in '.!?':
            summary += '.'
        
        # If summary is too similar to original or too short, try fallback
        if len(summary) < 20 or summary.lower() == original_text.lower():
            return self._fallback_summary(original_text, 150)
        
        return summary
    
    def _fallback_summary(self, text: str, max_length: int) -> str:
        """Fallback summarization using simple truncation"""
        sentences = text.split('. ')
        
        if len(sentences) <= 1:
            # Single sentence or no sentences, just truncate
            return text[:max_length - 3] + '...' if len(text) > max_length else text
        
        # Take first few sentences that fit within max_length
        summary = ""
        for sentence in sentences:
            if len(summary + sentence + '. ') <= max_length:
                summary += sentence + '. '
            else:
                break
        
        return summary.strip() if summary else text[:max_length - 3] + '...'
    
    def _fallback_summarize(self, text: str, max_length: int) -> str:
        """Simple fallback summarization when model is not available"""
        # Simple sentence-based summarization
        sentences = text.split('. ')
        if len(sentences) <= 2:
            return text[:max_length] + "..." if len(text) > max_length else text
        
        # Take first few sentences
        summary_sentences = sentences[:2]
        summary = '. '.join(summary_sentences)
        
        if len(summary) > max_length:
            summary = summary[:max_length-3] + "..."
        
        return summary
    
    def get_model_info(self) -> dict:
        """Get information about the loaded model"""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "loaded": self.pipeline is not None,
            "max_input_length": self.max_input_length
        }
