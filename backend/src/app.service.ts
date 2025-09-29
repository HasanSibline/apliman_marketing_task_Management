import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): { message: string; timestamp: string; version: string } {
    return {
      message: 'AI-powered Task Management System API is running!',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  getHealth(): { 
    status: string; 
    timestamp: string; 
    uptime: number;
    memory: NodeJS.MemoryUsage;
    version: string;
  } {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: '1.0.0',
    };
  }
}
