import asyncio
import logging
import re
from typing import Dict, List, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

logger = logging.getLogger(__name__)

class CompletenessChecker:
    def __init__(self):
        self.vectorizer = TfidfVectorizer(stop_words='english', max_features=1000)
        
        # Phase completion requirements
        self.phase_requirements = {
            'PENDING_APPROVAL': {
                'min_score': 0.3,
                'required_elements': ['description', 'goals']
            },
            'APPROVED': {
                'min_score': 0.4,
                'required_elements': ['description', 'goals', 'assignee']
            },
            'ASSIGNED': {
                'min_score': 0.5,
                'required_elements': ['description', 'goals', 'assignee', 'timeline']
            },
            'IN_PROGRESS': {
                'min_score': 0.6,
                'required_elements': ['description', 'goals', 'progress_updates']
            },
            'COMPLETED': {
                'min_score': 0.8,
                'required_elements': ['description', 'goals', 'deliverables', 'testing']
            },
            'ARCHIVED': {
                'min_score': 0.9,
                'required_elements': ['description', 'goals', 'deliverables', 'documentation']
            }
        }
        
        # Keywords for different completion aspects
        self.completion_keywords = {
            'implementation': ['implemented', 'developed', 'created', 'built', 'coded', 'finished'],
            'testing': ['tested', 'verified', 'validated', 'checked', 'confirmed', 'qa'],
            'documentation': ['documented', 'documented', 'readme', 'docs', 'guide', 'manual'],
            'deployment': ['deployed', 'released', 'live', 'production', 'published'],
            'review': ['reviewed', 'approved', 'signed off', 'validated', 'accepted']
        }
    
    async def check(self, description: str, goals: str, phase: str) -> Dict[str, Any]:
        """Check task completeness against goals and phase requirements"""
        try:
            # Calculate semantic similarity between description and goals
            similarity_score = self._calculate_similarity(description, goals)
            
            # Check phase-specific requirements
            phase_score = self._check_phase_requirements(description, goals, phase)
            
            # Analyze completion indicators
            completion_indicators = self._analyze_completion_indicators(description)
            
            # Calculate overall completeness score
            completeness_score = self._calculate_overall_score(
                similarity_score, phase_score, completion_indicators
            )
            
            # Generate suggestions
            suggestions = self._generate_suggestions(
                description, goals, phase, completeness_score, completion_indicators
            )
            
            # Determine if task is complete
            is_complete = self._determine_completion_status(
                completeness_score, phase, completion_indicators
            )
            
            return {
                'completeness_score': round(completeness_score, 2),
                'suggestions': suggestions,
                'is_complete': is_complete
            }
            
        except Exception as e:
            logger.error(f"Error in completeness check: {str(e)}")
            return {
                'completeness_score': 0.5,
                'suggestions': ['Unable to analyze task completeness at this time.'],
                'is_complete': False
            }
    
    def _calculate_similarity(self, description: str, goals: str) -> float:
        """Calculate semantic similarity between description and goals"""
        if not description or not goals:
            return 0.0
        
        try:
            # Combine texts for vectorization
            texts = [description.lower(), goals.lower()]
            
            # Create TF-IDF vectors
            tfidf_matrix = self.vectorizer.fit_transform(texts)
            
            # Calculate cosine similarity
            similarity = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:2])[0][0]
            
            return float(similarity)
            
        except Exception as e:
            logger.warning(f"Error calculating similarity: {str(e)}")
            return 0.5
    
    def _check_phase_requirements(self, description: str, goals: str, phase: str) -> float:
        """Check if task meets phase-specific requirements"""
        if phase not in self.phase_requirements:
            return 0.5
        
        requirements = self.phase_requirements[phase]
        text = (description + " " + goals).lower()
        
        # Check for required elements
        elements_found = 0
        total_elements = len(requirements['required_elements'])
        
        for element in requirements['required_elements']:
            if self._check_element_presence(text, element):
                elements_found += 1
        
        element_score = elements_found / total_elements if total_elements > 0 else 1.0
        
        return element_score
    
    def _check_element_presence(self, text: str, element: str) -> bool:
        """Check if a required element is present in the text"""
        element_patterns = {
            'description': ['describe', 'detail', 'explain', 'what', 'how'],
            'goals': ['goal', 'objective', 'target', 'aim', 'purpose'],
            'assignee': ['assign', 'responsible', 'owner', 'developer'],
            'timeline': ['deadline', 'due', 'schedule', 'timeline', 'date'],
            'progress_updates': ['progress', 'update', 'status', 'completed', 'working'],
            'deliverables': ['deliver', 'output', 'result', 'outcome', 'product'],
            'testing': ['test', 'verify', 'validate', 'check', 'qa'],
            'documentation': ['document', 'readme', 'guide', 'manual', 'docs']
        }
        
        patterns = element_patterns.get(element, [element])
        
        for pattern in patterns:
            if pattern in text:
                return True
        
        return False
    
    def _analyze_completion_indicators(self, description: str) -> Dict[str, float]:
        """Analyze indicators of task completion"""
        text = description.lower()
        indicators = {}
        
        for category, keywords in self.completion_keywords.items():
            score = 0
            for keyword in keywords:
                if keyword in text:
                    score += 1
            
            # Normalize score
            indicators[category] = min(score / len(keywords), 1.0)
        
        return indicators
    
    def _calculate_overall_score(self, similarity_score: float, phase_score: float, 
                               completion_indicators: Dict[str, float]) -> float:
        """Calculate overall completeness score"""
        # Weight different components
        weights = {
            'similarity': 0.3,
            'phase': 0.3,
            'completion': 0.4
        }
        
        # Calculate completion indicator average
        completion_avg = np.mean(list(completion_indicators.values())) if completion_indicators else 0.0
        
        # Calculate weighted score
        overall_score = (
            weights['similarity'] * similarity_score +
            weights['phase'] * phase_score +
            weights['completion'] * completion_avg
        )
        
        return min(overall_score, 1.0)
    
    def _generate_suggestions(self, description: str, goals: str, phase: str, 
                            completeness_score: float, completion_indicators: Dict[str, float]) -> List[str]:
        """Generate suggestions for improving task completeness"""
        suggestions = []
        
        # Low completeness score suggestions
        if completeness_score < 0.5:
            suggestions.append("Task description should better align with the stated goals")
            suggestions.append("Consider adding more specific details about implementation")
        
        # Phase-specific suggestions
        phase_suggestions = {
            'PENDING_APPROVAL': [
                "Ensure task description clearly outlines the requirements",
                "Add specific acceptance criteria"
            ],
            'APPROVED': [
                "Assign the task to a team member",
                "Set a realistic deadline"
            ],
            'ASSIGNED': [
                "Break down the task into smaller subtasks",
                "Create a timeline with milestones"
            ],
            'IN_PROGRESS': [
                "Provide regular progress updates",
                "Document any blockers or challenges"
            ],
            'COMPLETED': [
                "Ensure all deliverables are documented",
                "Verify testing has been completed",
                "Add deployment or release notes"
            ]
        }
        
        if phase in phase_suggestions:
            suggestions.extend(phase_suggestions[phase])
        
        # Completion indicator suggestions
        if completion_indicators.get('testing', 0) < 0.3:
            suggestions.append("Add information about testing procedures or results")
        
        if completion_indicators.get('documentation', 0) < 0.3:
            suggestions.append("Include documentation or user guides")
        
        if completion_indicators.get('implementation', 0) < 0.3:
            suggestions.append("Provide more details about the implementation approach")
        
        # Remove duplicates and limit suggestions
        suggestions = list(dict.fromkeys(suggestions))[:5]
        
        return suggestions if suggestions else ["Task appears to be well-documented"]
    
    def _determine_completion_status(self, completeness_score: float, phase: str, 
                                   completion_indicators: Dict[str, float]) -> bool:
        """Determine if task should be considered complete"""
        # Phase-specific completion thresholds
        phase_thresholds = {
            'PENDING_APPROVAL': 0.3,
            'APPROVED': 0.4,
            'ASSIGNED': 0.5,
            'IN_PROGRESS': 0.6,
            'COMPLETED': 0.8,
            'ARCHIVED': 0.9
        }
        
        threshold = phase_thresholds.get(phase, 0.7)
        
        # Check if score meets threshold
        if completeness_score >= threshold:
            # For completed phase, also check specific indicators
            if phase == 'COMPLETED':
                implementation_ok = completion_indicators.get('implementation', 0) >= 0.5
                testing_ok = completion_indicators.get('testing', 0) >= 0.3
                return implementation_ok and testing_ok
            
            return True
        
        return False
    
    def get_service_info(self) -> dict:
        """Get information about the completeness checker"""
        return {
            "service_name": "CompletenessChecker",
            "available": True,
            "supported_phases": list(self.phase_requirements.keys()),
            "completion_categories": list(self.completion_keywords.keys())
        }
