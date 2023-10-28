import { Module } from '@nestjs/common'
import SensorService from './sensor.service';
import SensorController from './sensor.controller';

@Module({
    imports: [],
    controllers: [SensorController],
    providers: [SensorService],
    exports: [SensorService]
})
export default class SensorModule { }
