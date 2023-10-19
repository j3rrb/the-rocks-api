import amqp from 'amqp-connection-manager';
import { Channel, ConsumeMessage } from 'amqplib';
import { MongoClient, ServerApiVersion } from 'mongodb';
import * as dotenv from 'dotenv';
import { AmqpConnectionManager } from 'amqp-connection-manager';
import { Logger } from '@nestjs/common';

dotenv.config();

enum SERVICES {
  rabbitmq = 'Worker RabbitMQ',
  mongodb = 'Worker MongoDB',
  worker = 'Worker',
}

export class RabbitMQWorker {
  private static instance: RabbitMQWorker;

  protected mongoConnection?: MongoClient;
  protected amqpConnection?: AmqpConnectionManager;

  private constructor() {}

  public static getInstance(): RabbitMQWorker {
    if (!RabbitMQWorker.instance) {
      RabbitMQWorker.instance = new RabbitMQWorker();
    }

    return RabbitMQWorker.instance;
  }

  protected async setupServices() {
    this.amqpConnection = await amqp.connect([process.env.RABBITMQ_URL]);

    if (!this.amqpConnection.isConnected()) {
      throw new Error('RabbitMQ not connected!');
    }

    Logger.debug('RabbitMQ connected!', SERVICES.rabbitmq);

    const mongoClient = new MongoClient(String(process.env.MONGODB_URL), {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });

    this.mongoConnection = await mongoClient.connect();

    Logger.debug('MongoDB connected!', SERVICES.mongodb);
  }

  async execute() {
    await this.setupServices();
    Logger.debug('All services are online!', SERVICES.worker);

    const db = await this.mongoConnection.db(
      String(process.env.MONGODB_DB_NAME),
    );
    Logger.debug(
      `Using database "${String(process.env.MONGODB_DB_NAME)}"`,
      SERVICES.worker,
    );

    const sensorCol = await db.collection(process.env.MONGODB_COLLECTION_NAME);
    Logger.debug(
      `Using collection "${String(process.env.MONGODB_COLLECTION_NAME)}"`,
      SERVICES.mongodb,
    );

    const handleMessage = async (msg: ConsumeMessage) => {
      if (msg) {
        let messageObj: Object | undefined;

        try {
          messageObj = JSON.parse(msg.content.toString());
        } catch (error) {
          Logger.error(
            `Message is not a valid JSON: ${msg.content.toString()}`,
            SERVICES.worker,
          );
          return;
        }

        if (!Object.keys(messageObj).length) {
          Logger.error(
            `Message is not a valid JSON: ${msg.content.toString()}`,
            SERVICES.worker,
          );
          return;
        }

        try {
          const result = await sensorCol.insertOne(messageObj);

          Logger.debug(
            `Dados enviados ao banco! ID: ${result.insertedId}`,
            SERVICES.mongodb,
          );
        } catch (error) {
          Logger.error(
            `Erro ao salvar a mensagem no banco: ${error}`,
            SERVICES.mongodb,
          );
        }
      }
    };

    this.mongoConnection.on('connect', () =>
      Logger.debug('Connected!', SERVICES.rabbitmq),
    );
    this.mongoConnection.on('disconnect', (err) =>
      Logger.debug(`Disconnected! ${err}`, SERVICES.rabbitmq),
    );

    const chanWrapper = await this.amqpConnection.createChannel({
      json: true,
      setup: (channel: Channel) =>
        Promise.all([
          channel.assertExchange(String(process.env.EXCHANGE_NAME), 'direct', {
            durable: true,
          }),
          channel.assertQueue(String(process.env.QUEUE_NAME), {
            durable: true,
          }),
          channel.consume(String(process.env.QUEUE_NAME), handleMessage, {
            noAck: true,
          }),
        ]),
    });

    await chanWrapper.waitForConnect();

    Logger.verbose(
      `[*] Waiting for queue messages on ${String(process.env.QUEUE_NAME)}`,
      SERVICES.rabbitmq,
    );
  }
}
