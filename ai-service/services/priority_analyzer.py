import asyncio
import logging
import re
from typing import Dict, Any
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import torch

logger = logging.getLogger(__name__)

class PriorityAnalyzer:
    def __init__(self):
        self.model_name = "google/flan-t5-small"
        self.tokenizer = None
        self.model = None
        self.pipeline = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        
        # Priority keywords and their weights
        self.priority_keywords = {
            5: ['urgent', 'critical', 'emergency', 'asap', 'immediately', 'blocker', 'high priority'],
            4: ['important', 'high', 'priority', 'deadline', 'time-sensitive', 'escalated'],
            3: ['normal', 'standard', 'regular', 'moderate', 'medium'],
            2: ['low', 'minor', 'nice to have', 'enhancement', 'improvement'],
            1: ['trivial', 'cosmetic', 'documentation', 'cleanup', 'refactor']
        }
        
    async def load_model(self):
        """Load the priority analysis model"""
        try:
            logger.info(f"Loading priority analysis model: {self.model_name}")
            
            loop = asyncio.get_event_loop()
            
            def _load_model():
                tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                model = AutoModelForSeq2SeqLM.from_pretrained(self.model_name)
                
                if self.device == "cuda":
                    model = model.to(self.device)
                
                pipe = pipeline(
                    "text2text-generation",
                    model=model,
                    tokenizer=tokenizer,
                    device=0 if self.device == "cuda" else -1,
                    max_length=256,
                    do_sample=True,
                    temperature=0.3,
                    top_p=0.8
                )
                
                return tokenizer, model, pipe
            
            self.tokenizer, self.model, self.pipeline = await loop.run_in_executor(
                None, _load_model
            )
            
            logger.info("✅ Priority analysis model loaded successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to load priority analysis model: {str(e)}")
            # Continue without AI model, use rule-based approach
            pass
    
    async def analyze(self, title: str, description: str) -> Dict[str, Any]:
        """Analyze task priority based on title and description"""
        try:
            # Combine title and description
            full_text = f"Title: {title}\nDescription: {description}"
            
            # Rule-based analysis (always available)
            rule_based_priority = self._rule_based_analysis(full_text)
            
            # AI-based analysis (if model is available)
            ai_priority = None
            ai_reasoning = ""
            
            if self.pipeline:
                try:
                    ai_result = await self._ai_based_analysis(full_text)
                    ai_priority = ai_result.get('priority', rule_based_priority)
                    ai_reasoning = ai_result.get('reasoning', '')
                except Exception as e:
                    logger.warning(f"AI analysis failed, using rule-based: {str(e)}")
            
            # Combine results
            final_priority = ai_priority if ai_priority else rule_based_priority
            confidence = self._calculate_confidence(rule_based_priority, ai_priority)
            
            # Generate reasoning
            reasoning = self._generate_reasoning(
                title, description, final_priority, ai_reasoning
            )
            
            return {
                'priority': final_priority,
                'reasoning': reasoning,
                'confidence': confidence
            }
            
        except Exception as e:
            logger.error(f"Error in priority analysis: {str(e)}")
            # Fallback to default priority
            return {
                'priority': 3,
                'reasoning': 'Unable to analyze priority. Assigned default medium priority.',
                'confidence': 0.5
            }
    
    def _rule_based_analysis(self, text: str) -> int:
        """Rule-based priority analysis using keywords"""
        text_lower = text.lower()
        
        # Count keyword matches for each priority level
        priority_scores = {}
        
        for priority, keywords in self.priority_keywords.items():
            score = 0
            for keyword in keywords:
                # Count occurrences of each keyword
                count = len(re.findall(r'\b' + re.escape(keyword) + r'\b', text_lower))
                score += count
            priority_scores[priority] = score
        
        # Find the priority with the highest score
        if any(priority_scores.values()):
            max_priority = max(priority_scores, key=priority_scores.get)
            return max_priority
        
        # Additional heuristics
        priority = 3  # Default medium priority
        
        # Check for time indicators
        if any(word in text_lower for word in ['today', 'tomorrow', 'this week', 'deadline']):
            priority = max(priority, 4)
        
        # Check for impact indicators
        if any(word in text_lower for word in ['bug', 'error', 'broken', 'not working']):
            priority = max(priority, 4)
        
        # Check for user-facing issues
        if any(word in text_lower for word in ['user', 'customer', 'client', 'production']):
            priority = max(priority, 3)
        
        # Check for enhancement/improvement indicators
        if any(word in text_lower for word in ['enhancement', 'improvement', 'optimization', 'refactor']):
            priority = min(priority, 2)
        
        return priority
    
    async def _ai_based_analysis(self, text: str) -> Dict[str, Any]:
        """AI-based priority analysis using the language model"""
        prompt = f"""
        Analyze the following task and determine its priority level from 1-5 (1=lowest, 5=highest).
        Consider urgency, impact, and business value.
        
        Task: {text}
        
        Provide the priority level (1-5) and a brief explanation.
        Format: Priority: X, Reasoning: [explanation]
        """
        
        loop = asyncio.get_event_loop()
        
        def _generate_analysis():
            result = self.pipeline(
                prompt,
                max_length=200,
                min_length=50,
                do_sample=True,
                temperature=0.3,
                top_p=0.8
            )
            return result[0]['generated_text']
        
        response = await loop.run_in_executor(None, _generate_analysis)
        
        # Parse the response
        priority = self._extract_priority_from_response(response)
        reasoning = self._extract_reasoning_from_response(response)
        
        return {
            'priority': priority,
            'reasoning': reasoning
        }
    
    def _extract_priority_from_response(self, response: str) -> int:
        """Extract priority number from AI response"""
        # Look for patterns like "Priority: 4" or "priority level 3"
        priority_patterns = [
            r'priority:?\s*(\d)',
            r'priority level:?\s*(\d)',
            r'level:?\s*(\d)',
            r'(\d)\s*(?:out of 5|/5)'
        ]
        
        for pattern in priority_patterns:
            match = re.search(pattern, response.lower())
            if match:
                priority = int(match.group(1))
                if 1 <= priority <= 5:
                    return priority
        
        # Fallback: look for any digit 1-5
        digits = re.findall(r'\b([1-5])\b', response)
        if digits:
            return int(digits[0])
        
        return 3  # Default medium priority
    
    def _extract_reasoning_from_response(self, response: str) -> str:
        """Extract reasoning from AI response"""
        # Look for reasoning after keywords
        reasoning_patterns = [
            r'reasoning:?\s*(.+?)(?:\n|$)',
            r'explanation:?\s*(.+?)(?:\n|$)',
            r'because:?\s*(.+?)(?:\n|$)'
        ]
        
        for pattern in reasoning_patterns:
            match = re.search(pattern, response.lower())
            if match:
                return match.group(1).strip()
        
        # If no specific reasoning found, return the whole response (cleaned)
        return response.strip()[:200]  # Limit length
    
    def _calculate_confidence(self, rule_priority: int, ai_priority: int = None) -> float:
        """Calculate confidence score based on agreement between methods"""
        if ai_priority is None:
            return 0.7  # Medium confidence for rule-based only
        
        # High confidence if both methods agree
        if rule_priority == ai_priority:
            return 0.9
        
        # Medium confidence if they're close
        if abs(rule_priority - ai_priority) <= 1:
            return 0.8
        
        # Lower confidence if they disagree significantly
        return 0.6
    
    def _generate_reasoning(self, title: str, description: str, priority: int, ai_reasoning: str = "") -> str:
        """Generate human-readable reasoning for the priority assignment"""
        priority_labels = {
            1: "Very Low",
            2: "Low", 
            3: "Medium",
            4: "High",
            5: "Critical"
        }
        
        reasoning_parts = []
        
        # Add priority level
        reasoning_parts.append(f"Assigned {priority_labels[priority]} priority ({priority}/5)")
        
        # Add AI reasoning if available
        if ai_reasoning:
            reasoning_parts.append(f"AI Analysis: {ai_reasoning}")
        
        # Add rule-based insights
        text_lower = (title + " " + description).lower()
        
        if priority >= 4:
            if any(word in text_lower for word in ['urgent', 'critical', 'asap']):
                reasoning_parts.append("Contains urgent language")
            if any(word in text_lower for word in ['bug', 'error', 'broken']):
                reasoning_parts.append("Appears to be a critical issue")
        
        if priority <= 2:
            if any(word in text_lower for word in ['enhancement', 'improvement']):
                reasoning_parts.append("Identified as enhancement/improvement")
        
        return ". ".join(reasoning_parts) + "."
    
    def get_model_info(self) -> dict:
        """Get information about the priority analyzer"""
        return {
            "model_name": self.model_name,
            "device": self.device,
            "loaded": self.pipeline is not None,
            "rule_based_available": True
        }
