import { Controller, Get, Param, Query } from '@nestjs/common'
import SensorService from './sensor.service';

@Controller('sensor')
export default class SensorController {
    constructor(private readonly sensorService: SensorService) { }

    @Get(':companyId')
    async listData(
        @Param('companyId') companyId: string,
        @Query('days') days?: number
    ) {
        return await this.sensorService.list(companyId, days)
    }
}
