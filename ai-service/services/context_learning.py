import logging
from typing import Dict, List, Any, Optional
import google.generativeai as genai
from datetime import datetime
import json
import re

logger = logging.getLogger(__name__)

class ContextLearningService:
    """Advanced AI-powered context learning service that learns and updates user information"""

    def __init__(self, api_key: str, model_name: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name)
        logger.info(f"✅ ContextLearningService initialized with {model_name}")

    def extract_and_update_context(
        self,
        message: str,
        existing_context: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        user_info: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Use AI to intelligently extract and UPDATE user context from messages.
        Handles corrections, updates, and new information.
        
        Args:
            message: Current user message
            existing_context: Previously learned context
            conversation_history: Recent conversation for context
            user_info: Current user details
            
        Returns:
            Updated context dictionary or None if nothing new learned
        """
        try:
            # Build prompt for context extraction
            prompt = f"""You are a context extraction AI. Your job is to extract and update information about the user from their messages.

IMPORTANT: If the user provides NEW or CORRECTED information, ALWAYS update the context with the latest information. Previous values should be REPLACED with new ones.

Current known context about the user:
{json.dumps(existing_context, indent=2)}

Recent conversation history:
{self._format_history(conversation_history[-5:])}

Current user message: "{message}"

Your task:
1. Extract ANY new information about the user (name, preferences, work details, interests, etc.)
2. If the user is CORRECTING previous information, REPLACE the old value with the new one
3. If the user is UPDATING information, merge or replace as appropriate
4. Return ONLY the NEW or UPDATED fields (not the entire context)

Examples of what to extract:
- Personal info: name, nickname, location, age, etc.
- Preferences: likes, dislikes, work style, communication preferences
- Professional info: role, responsibilities, projects, expertise
- Interests: hobbies, topics they care about
- Any factual information the user shares about themselves

Rules:
- If user says "my name is X" when we already know a different name, UPDATE it to X
- If user says "I prefer Y" when we know they prefer Z, UPDATE it to Y
- Be comprehensive - extract ALL relevant information
- Use clear field names (e.g., "name", "preferred_name", "work_role", "interests")
- For corrections/updates, explicitly replace old values

Return your response as a JSON object with ONLY the fields that should be updated or added.
If nothing new is learned, return an empty object {{}}.

Response format:
{{
  "field_name": "new_value",
  "another_field": "updated_value"
}}

JSON Response:"""

            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # Extract JSON from response
            learned_context = self._extract_json_from_response(response_text)
            
            if learned_context and len(learned_context) > 0:
                logger.info(f"✅ Learned new context: {learned_context}")
                return learned_context
            
            return None

        except Exception as e:
            logger.error(f"Error extracting context: {e}")
            return None

    def learn_from_tasks(
        self,
        completed_tasks: List[Dict[str, Any]],
        active_tasks: List[Dict[str, Any]],
        existing_context: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Learn about user's work patterns, interests, and expertise from their tasks
        
        Args:
            completed_tasks: List of completed tasks
            active_tasks: List of active tasks
            existing_context: Current context
            
        Returns:
            Learned context from tasks
        """
        try:
            if not completed_tasks and not active_tasks:
                return None

            # Prepare task summaries
            completed_summary = self._summarize_tasks(completed_tasks[:10])  # Last 10
            active_summary = self._summarize_tasks(active_tasks[:5])  # Top 5

            prompt = f"""Analyze the user's tasks and extract insights about them.

Current known context:
{json.dumps(existing_context, indent=2)}

Completed Tasks Summary:
{completed_summary}

Active Tasks Summary:
{active_summary}

Based on these tasks, extract insights about the user:
1. Work areas/expertise (what type of work do they do?)
2. Interests (what topics appear frequently?)
3. Work patterns (do they handle urgent tasks? creative work? analytical work?)
4. Responsibilities (what are they responsible for?)
5. Skills (what skills do these tasks indicate?)
6. Work preferences (any patterns in how they work?)

Return ONLY NEW insights that aren't already in the context.

Response format (JSON only):
{{
  "work_areas": ["area1", "area2"],
  "expertise": "brief description",
  "common_task_types": ["type1", "type2"],
  "responsibilities": "brief description",
  "skills": ["skill1", "skill2"],
  "work_patterns": "brief description"
}}

JSON Response:"""

            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            learned_context = self._extract_json_from_response(response_text)
            
            if learned_context and len(learned_context) > 0:
                logger.info(f"✅ Learned from tasks: {learned_context}")
                return learned_context
            
            return None

        except Exception as e:
            logger.error(f"Error learning from tasks: {e}")
            return None

    def learn_about_domain(
        self,
        domain_topic: str,
        user_questions: List[str],
        existing_knowledge: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Learn what the user wants to know about specific domains (Apliman, competitors, etc.)
        
        Args:
            domain_topic: The topic (e.g., "apliman", "competitors", "services")
            user_questions: List of user questions about this topic
            existing_knowledge: What we already know
            
        Returns:
            Updated knowledge about what user is interested in
        """
        try:
            if not user_questions:
                return None

            prompt = f"""Analyze what the user wants to know about "{domain_topic}".

Their questions:
{chr(10).join(f"- {q}" for q in user_questions)}

What we already know about their interests:
{json.dumps(existing_knowledge, indent=2)}

Determine:
1. What specific aspects of {domain_topic} are they interested in?
2. What level of detail do they need?
3. What are their main concerns or focus areas?

Return as JSON:
{{
  "topics_of_interest": ["topic1", "topic2"],
  "detail_level": "high/medium/basic",
  "focus_areas": ["area1", "area2"],
  "common_questions": ["question_type1", "question_type2"]
}}

JSON Response:"""

            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            learned = self._extract_json_from_response(response_text)
            
            if learned:
                return {f"{domain_topic}_interests": learned}
            
            return None

        except Exception as e:
            logger.error(f"Error learning about domain: {e}")
            return None

    def merge_context_intelligently(
        self,
        existing_context: Dict[str, Any],
        new_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Intelligently merge new context with existing context.
        Handles updates, additions, and array merging.
        
        Args:
            existing_context: Current context
            new_context: New context to merge
            
        Returns:
            Merged context
        """
        merged = dict(existing_context)
        
        for key, value in new_context.items():
            if key == 'lastUpdated':
                continue
                
            # If the key doesn't exist, just add it
            if key not in merged:
                merged[key] = value
                continue
            
            # If it's a list, merge intelligently
            if isinstance(value, list) and isinstance(merged[key], list):
                # Merge lists, removing duplicates
                merged[key] = list(set(merged[key] + value))
            
            # If it's a dict, merge recursively
            elif isinstance(value, dict) and isinstance(merged[key], dict):
                merged[key] = self.merge_context_intelligently(merged[key], value)
            
            # For primitive values, new value replaces old (this handles corrections)
            else:
                merged[key] = value
        
        merged['lastUpdated'] = datetime.now().isoformat()
        return merged

    def _summarize_tasks(self, tasks: List[Dict[str, Any]]) -> str:
        """Create a summary of tasks for AI analysis"""
        if not tasks:
            return "No tasks"
        
        summaries = []
        for task in tasks:
            summary = f"- {task.get('title', 'Untitled')}"
            if task.get('description'):
                desc = task['description'][:100]
                summary += f": {desc}"
            if task.get('priority'):
                summary += f" (Priority: {task['priority']})"
            summaries.append(summary)
        
        return "\n".join(summaries)

    def _format_history(self, history: List[Dict[str, Any]]) -> str:
        """Format conversation history for prompt"""
        if not history:
            return "No previous conversation"
        
        formatted = []
        for msg in history:
            role = "User" if msg['role'] == 'user' else "Assistant"
            content = msg['content'][:150]
            formatted.append(f"{role}: {content}")
        
        return "\n".join(formatted)

    def _extract_json_from_response(self, response_text: str) -> Optional[Dict[str, Any]]:
        """Extract JSON from AI response, handling various formats"""
        try:
            # Try direct JSON parse
            return json.loads(response_text)
        except:
            pass
        
        # Try to find JSON in markdown code blocks
        json_match = re.search(r'```json\s*(.*?)\s*```', response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except:
                pass
        
        # Try to find any JSON object in the text
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except:
                pass
        
        logger.warning(f"Could not extract JSON from response: {response_text[:200]}")
        return None

