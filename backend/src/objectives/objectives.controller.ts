import { Controller, Get, Post, Body, Param, Patch, Delete, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ObjectivesService } from './objectives.service';
import { CreateObjectiveDto } from './dto/create-objective.dto';
import { CreateKeyResultDto, UpdateKeyResultDto } from './dto/key-result.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../types/prisma';

@ApiTags('Objectives')
@Controller('objectives')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ObjectivesController {
    constructor(private readonly objectivesService: ObjectivesService) { }

    @Get()
    @ApiQuery({ name: 'quarterId', required: false })
    findAll(@Request() req, @Query('quarterId') quarterId?: string) {
        return this.objectivesService.findAll(req.user.companyId, quarterId);
    }

    @Get(':id')
    findOne(@Param('id') id: string, @Request() req) {
        return this.objectivesService.findOne(id, req.user.companyId);
    }

    @Post()
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    create(@Body() dto: CreateObjectiveDto, @Request() req) {
        return this.objectivesService.create(dto, req.user.companyId);
    }

    @Patch(':id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    update(@Param('id') id: string, @Body() dto: Partial<CreateObjectiveDto>, @Request() req) {
        return this.objectivesService.update(id, req.user.companyId, dto);
    }

    @Delete(':id')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    remove(@Param('id') id: string, @Request() req) {
        return this.objectivesService.remove(id, req.user.companyId);
    }

    // Key Results
    @Post(':id/key-results')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    addKeyResult(@Param('id') id: string, @Body() dto: CreateKeyResultDto, @Request() req) {
        return this.objectivesService.addKeyResult(id, req.user.companyId, dto);
    }

    @Patch('key-results/:krId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    updateKeyResult(@Param('krId') krId: string, @Body() dto: UpdateKeyResultDto, @Request() req) {
        return this.objectivesService.updateKeyResult(krId, req.user.companyId, dto);
    }

    @Delete('key-results/:krId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    removeKeyResult(@Param('krId') krId: string, @Request() req) {
        return this.objectivesService.removeKeyResult(krId, req.user.companyId);
    }

    // Task links
    @Post(':id/tasks/:taskId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    linkTask(
        @Param('id') id: string, 
        @Param('taskId') taskId: string, 
        @Body() body: { keyResultId?: string },
        @Request() req
    ) {
        return this.objectivesService.linkTask(id, req.user.companyId, taskId, body?.keyResultId);
    }

    @Delete(':id/tasks/:taskId')
    @Roles(UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SUPER_ADMIN)
    unlinkTask(@Param('id') id: string, @Param('taskId') taskId: string, @Request() req) {
        return this.objectivesService.unlinkTask(id, req.user.companyId, taskId);
    }
}
