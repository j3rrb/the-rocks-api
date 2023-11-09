import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RabbitMQWorker } from './workers/rabbitmq.worker';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const PORT = Number(process.env.APP_PORT);
  const app = await NestFactory.create(AppModule, {
    cors: {
      methods: ['GET', 'POST'],
      origin: '*',
      allowedHeaders: '*',
    },
  });

  const rmq = RabbitMQWorker.getInstance();
  await rmq.execute();

  await app.listen(PORT || 3000, () => {
    Logger.log(`App listening on port ${PORT}`, 'NestApplication');
  });

  process.on('beforeExit', async () => {
    await Promise.all([
      rmq.amqpConnection.close(),
      rmq.mongoConnection.close(),
      rmq.socketServer.close(),
    ]);
    process.exit(0);
  });
}

bootstrap().catch((err) => {
  Logger.error(`Error bootstrapping the API: ${err}`, 'NestApplication');
});
