import { Module } from '@nestjs/common';
import { SensorModule } from './modules';

@Module({
  imports: [SensorModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
