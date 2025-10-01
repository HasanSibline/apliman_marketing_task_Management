import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class PerformanceInsightsDto {
  @ApiProperty({
    description: 'Dashboard analytics data',
    example: {
      totalTasks: 100,
      completedTasks: 75,
      activeUsers: 10,
      totalUsers: 15,
      tasksByPhase: {
        PENDING_APPROVAL: 10,
        APPROVED: 15,
        ASSIGNED: 20,
        IN_PROGRESS: 30,
        COMPLETED: 20,
        ARCHIVED: 5,
      },
    },
  })
  @IsObject()
  @IsOptional()
  dashboard?: any;

  @ApiProperty({
    description: 'User analytics data',
    example: {
      tasksCompleted: 25,
      totalTasks: 30,
      totalTimeSpent: 3600,
      averageTaskTime: 120,
      productivityScore: 0.85,
    },
  })
  @IsObject()
  @IsOptional()
  user?: any;

  @ApiProperty({
    description: 'Team analytics data',
    example: {
      teamSize: 10,
      activeMembers: 8,
      totalTimeSpent: 36000,
      averageTimePerMember: 3600,
      teamPerformance: 0.75,
    },
  })
  @IsObject()
  @IsOptional()
  team?: any;

  @ApiProperty({
    description: 'Task analytics data',
    example: {
      completionRate: 0.8,
      tasksCompletedThisWeek: 15,
      weekOverWeekChange: 0.1,
      taskDistribution: {
        HIGH_PRIORITY: 10,
        MEDIUM_PRIORITY: 20,
        LOW_PRIORITY: 15,
      },
    },
  })
  @IsObject()
  @IsOptional()
  tasks?: any;
}
