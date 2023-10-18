import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RabbitMQWorker } from './workers/rabbitmq.worker';
import { Logger } from '@nestjs/common'

async function executeWorkers() {
  const rmq = RabbitMQWorker.getInstance();
  await rmq.execute()
}

async function bootstrap() {
  const PORT = Number(process.env.APP_PORT)
  const app = await NestFactory.create(AppModule);

  await executeWorkers();

  await app.listen(PORT || 3000, () => {
    Logger.log(`App listening on port ${PORT}`, 'NestApplication');
  });
}

bootstrap().catch((err) => {
  Logger.error(`Error bootstrapping the API: ${err}`, 'NestApplication');
});
