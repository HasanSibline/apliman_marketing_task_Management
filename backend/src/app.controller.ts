import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'API is running' })
  getHello(): { message: string; timestamp: string; version: string } {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Detailed health check' })
  @ApiResponse({ status: 200, description: 'Detailed health information' })
  getHealth(): { 
    status: string; 
    timestamp: string; 
    uptime: number;
    memory: NodeJS.MemoryUsage;
    version: string;
  } {
    return this.appService.getHealth();
  }

  @Get('keepalive')
  @ApiOperation({ summary: 'Keepalive endpoint to prevent service sleep' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  getKeepalive(): { 
    status: string
    timestamp: string
    message: string
  } {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      message: 'Service is awake and running'
    };
  }
}
