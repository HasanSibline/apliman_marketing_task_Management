import logging
from typing import Dict, List, Any
import numpy as np
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class PerformanceInsightsService:
    def __init__(self):
        self.insight_templates = {
            'productivity': [
                "Team productivity has {trend} by {percentage}% compared to last period",
                "Average task completion time is {value} days",
                "Task completion rate is {percentage}%"
            ],
            'workload': [
                "Current workload distribution shows {observation}",
                "Team member {name} has {percentage}% of total assigned tasks",
                "Average tasks per team member: {value}"
            ],
            'quality': [
                "Task quality metrics indicate {trend} in deliverable standards",
                "Rework rate is {percentage}% of completed tasks",
                "Average task complexity score: {value}/5"
            ],
            'collaboration': [
                "Team collaboration score: {value}/10",
                "Average comments per task: {value}",
                "Cross-team interaction frequency: {frequency}"
            ]
        }
        
        self.recommendation_templates = {
            'high_workload': "Consider redistributing tasks from overloaded team members",
            'low_productivity': "Implement daily standups to improve task completion rates",
            'quality_issues': "Introduce peer review process for critical tasks",
            'poor_collaboration': "Encourage more frequent task updates and comments",
            'deadline_pressure': "Review task estimation process and deadlines",
            'skill_gaps': "Identify training needs based on task completion patterns"
        }
    
    async def generate_insights(self, analytics_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate performance insights from analytics data"""
        try:
            insights = []
            recommendations = []
            trends = []
            
            # Analyze different aspects of performance
            productivity_insights = self._analyze_productivity(analytics_data)
            workload_insights = self._analyze_workload(analytics_data)
            quality_insights = self._analyze_quality(analytics_data)
            collaboration_insights = self._analyze_collaboration(analytics_data)
            
            # Combine insights
            insights.extend(productivity_insights['insights'])
            insights.extend(workload_insights['insights'])
            insights.extend(quality_insights['insights'])
            insights.extend(collaboration_insights['insights'])
            
            # Generate recommendations
            recommendations.extend(productivity_insights['recommendations'])
            recommendations.extend(workload_insights['recommendations'])
            recommendations.extend(quality_insights['recommendations'])
            recommendations.extend(collaboration_insights['recommendations'])
            
            # Identify trends
            trends.extend(self._identify_trends(analytics_data))
            
            # Limit results
            insights = insights[:8]
            recommendations = recommendations[:6]
            trends = trends[:5]
            
            return {
                'insights': insights,
                'recommendations': recommendations,
                'trends': trends
            }
            
        except Exception as e:
            logger.error(f"Error generating performance insights: {str(e)}")
            return {
                'insights': ['Performance analysis temporarily unavailable.'],
                'recommendations': ['Continue monitoring task completion rates.'],
                'trends': ['Data collection in progress.']
            }
    
    def _analyze_productivity(self, data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Analyze productivity metrics"""
        insights = []
        recommendations = []
        
        try:
            # Extract relevant data
            total_tasks = data.get('totalTasks', 0)
            completed_tasks = data.get('tasksByPhase', {}).get('COMPLETED', 0)
            team_stats = data.get('teamMembers', [])
            
            if total_tasks > 0:
                completion_rate = (completed_tasks / total_tasks) * 100
                insights.append(f"Overall task completion rate is {completion_rate:.1f}%")
                
                if completion_rate < 60:
                    recommendations.append("Focus on completing existing tasks before taking on new ones")
                elif completion_rate > 85:
                    insights.append("Excellent task completion rate indicates high team productivity")
            
            # Analyze individual performance
            if team_stats:
                completion_rates = []
                for member in team_stats:
                    assigned = member.get('tasksAssigned', 0)
                    completed = member.get('tasksCompleted', 0)
                    if assigned > 0:
                        rate = (completed / assigned) * 100
                        completion_rates.append(rate)
                
                if completion_rates:
                    avg_rate = np.mean(completion_rates)
                    std_rate = np.std(completion_rates)
                    
                    insights.append(f"Average individual completion rate: {avg_rate:.1f}%")
                    
                    if std_rate > 20:
                        recommendations.append("Address performance gaps between team members")
            
        except Exception as e:
            logger.warning(f"Error in productivity analysis: {str(e)}")
        
        return {'insights': insights, 'recommendations': recommendations}
    
    def _analyze_workload(self, data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Analyze workload distribution"""
        insights = []
        recommendations = []
        
        try:
            team_stats = data.get('teamMembers', [])
            
            if team_stats:
                assigned_tasks = [member.get('tasksAssigned', 0) for member in team_stats]
                in_progress_tasks = [member.get('tasksInProgress', 0) for member in team_stats]
                
                if assigned_tasks:
                    max_assigned = max(assigned_tasks)
                    min_assigned = min(assigned_tasks)
                    avg_assigned = np.mean(assigned_tasks)
                    
                    insights.append(f"Average tasks per team member: {avg_assigned:.1f}")
                    
                    # Check for workload imbalance
                    if max_assigned > 0 and (max_assigned - min_assigned) / max_assigned > 0.5:
                        insights.append("Significant workload imbalance detected across team members")
                        recommendations.append("Consider redistributing tasks to balance workload")
                
                if in_progress_tasks:
                    total_in_progress = sum(in_progress_tasks)
                    if total_in_progress > len(team_stats) * 3:  # More than 3 tasks per person
                        recommendations.append("High number of concurrent tasks may impact focus and quality")
            
        except Exception as e:
            logger.warning(f"Error in workload analysis: {str(e)}")
        
        return {'insights': insights, 'recommendations': recommendations}
    
    def _analyze_quality(self, data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Analyze quality metrics"""
        insights = []
        recommendations = []
        
        try:
            # Analyze task phases for quality indicators
            phases = data.get('tasksByPhase', {})
            total_tasks = sum(phases.values())
            
            if total_tasks > 0:
                # Check for tasks stuck in review phases
                pending_approval = phases.get('PENDING_APPROVAL', 0)
                if pending_approval / total_tasks > 0.2:  # More than 20% pending
                    insights.append("High number of tasks pending approval may indicate bottlenecks")
                    recommendations.append("Streamline approval process to reduce delays")
                
                # Check completion vs assignment ratio
                completed = phases.get('COMPLETED', 0)
                assigned = phases.get('ASSIGNED', 0)
                
                if assigned > 0 and completed / assigned < 0.5:
                    recommendations.append("Focus on completing assigned tasks to improve delivery rate")
            
            # Analyze recent activity patterns
            recent_tasks = data.get('recentTasks', [])
            if recent_tasks:
                # Check for rapid task creation without completion
                if len(recent_tasks) > 10:  # Many recent tasks
                    insights.append("High task creation rate detected")
                    recommendations.append("Ensure task completion keeps pace with new task creation")
            
        except Exception as e:
            logger.warning(f"Error in quality analysis: {str(e)}")
        
        return {'insights': insights, 'recommendations': recommendations}
    
    def _analyze_collaboration(self, data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Analyze collaboration metrics"""
        insights = []
        recommendations = []
        
        try:
            team_stats = data.get('teamMembers', [])
            
            if team_stats:
                total_interactions = sum(member.get('interactions', 0) for member in team_stats)
                active_members = len([m for m in team_stats if m.get('interactions', 0) > 0])
                
                if active_members > 0:
                    avg_interactions = total_interactions / active_members
                    insights.append(f"Average interactions per active team member: {avg_interactions:.1f}")
                    
                    if avg_interactions < 5:
                        recommendations.append("Encourage more frequent task updates and team communication")
                    elif avg_interactions > 20:
                        insights.append("High collaboration levels indicate good team communication")
                
                # Check for inactive members
                inactive_members = len(team_stats) - active_members
                if inactive_members > 0:
                    insights.append(f"{inactive_members} team members have no recent interactions")
                    recommendations.append("Engage inactive team members in task discussions")
            
        except Exception as e:
            logger.warning(f"Error in collaboration analysis: {str(e)}")
        
        return {'insights': insights, 'recommendations': recommendations}
    
    def _identify_trends(self, data: Dict[str, Any]) -> List[str]:
        """Identify performance trends"""
        trends = []
        
        try:
            # Analyze task creation vs completion trends
            phases = data.get('tasksByPhase', {})
            
            pending = phases.get('PENDING_APPROVAL', 0)
            in_progress = phases.get('IN_PROGRESS', 0)
            completed = phases.get('COMPLETED', 0)
            
            total_active = pending + in_progress
            
            if completed > total_active:
                trends.append("Positive trend: More tasks completed than currently active")
            elif total_active > completed * 1.5:
                trends.append("Concerning trend: Active tasks significantly exceed completed tasks")
            
            # Analyze team growth/activity trends
            team_stats = data.get('teamMembers', [])
            if team_stats:
                active_count = len([m for m in team_stats if m.get('interactions', 0) > 0])
                total_count = len(team_stats)
                
                activity_rate = (active_count / total_count) * 100 if total_count > 0 else 0
                
                if activity_rate > 80:
                    trends.append("High team engagement with most members actively participating")
                elif activity_rate < 50:
                    trends.append("Low team engagement - many members not actively participating")
            
            # Performance consistency trends
            if team_stats:
                completion_rates = []
                for member in team_stats:
                    assigned = member.get('tasksAssigned', 0)
                    completed = member.get('tasksCompleted', 0)
                    if assigned > 0:
                        completion_rates.append((completed / assigned) * 100)
                
                if completion_rates and len(completion_rates) > 1:
                    std_dev = np.std(completion_rates)
                    if std_dev < 15:
                        trends.append("Consistent performance across team members")
                    else:
                        trends.append("Variable performance levels across team members")
            
        except Exception as e:
            logger.warning(f"Error identifying trends: {str(e)}")
        
        return trends
    
    def get_service_info(self) -> dict:
        """Get information about the performance insights service"""
        return {
            "service_name": "PerformanceInsightsService",
            "available": True,
            "analysis_categories": ["productivity", "workload", "quality", "collaboration"],
            "insight_types": ["insights", "recommendations", "trends"]
        }
