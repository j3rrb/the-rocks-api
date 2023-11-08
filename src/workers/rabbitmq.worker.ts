import amqp from 'amqp-connection-manager'
import { Channel, ConsumeMessage } from 'amqplib'
import { InsertManyResult, InsertOneResult, MongoClient, ServerApiVersion } from 'mongodb'
import * as dotenv from 'dotenv'
import { AmqpConnectionManager } from 'amqp-connection-manager'
import { Logger } from '@nestjs/common'
import { WebSocketServer, WebSocket } from 'ws'
import { randomUUID } from 'node:crypto'
import { MemoryCache, caching } from 'cache-manager'
import { Server } from 'socket.io'
import { createServer } from 'node:http'

dotenv.config()

enum SERVICES {
    rabbitmq = 'Worker RabbitMQ',
    mongodb = 'Worker MongoDB',
    socket = 'Worker Socket Server',
    worker = 'Worker',
}

export class RabbitMQWorker {
    private static instance: RabbitMQWorker;

    mongoConnection?: MongoClient;
    amqpConnection?: AmqpConnectionManager;
    socketServer?: Server;
    cacheManager?: MemoryCache;

    private constructor() { }

    public static getInstance(): RabbitMQWorker {
        if (!RabbitMQWorker.instance) {
            RabbitMQWorker.instance = new RabbitMQWorker();
        }

        return RabbitMQWorker.instance;
    }

    protected handleDisconnect(userId: string) {
        Logger.verbose(`${userId} disconnected.`, SERVICES.socket);
    }

    protected async setupServices() {
        this.amqpConnection = await amqp.connect([
            process.env.RABBITMQ_URL
        ])

        Logger.debug('RabbitMQ connected!', SERVICES.rabbitmq);

        const mongoClient = new MongoClient(String(process.env.MONGODB_URL), {
            serverApi: {
                version: ServerApiVersion.v1,
                strict: true,
                deprecationErrors: true,
            }
        }
        );

        this.mongoConnection = await mongoClient.connect();

        Logger.debug('MongoDB connected!', SERVICES.mongodb);

        this.cacheManager = await caching('memory', {
            max: 100,
            ttl: 0
        });

        const WS_PORT = 3100
        const wsHttpServer = createServer()
        this.socketServer = new Server(wsHttpServer, {
            cors: {
                allowedHeaders: '*',
                methods: '*',
                origin: '*'
            }
        })

        this.socketServer.on('connection', async (conn) => {
            Logger.verbose(`New socket connection: ${conn.id}`, SERVICES.socket)

            conn.on('disconnect', () => {
                this.handleDisconnect(conn.id)
            })
        })

        wsHttpServer.listen(WS_PORT, () => {
            Logger.debug(`Socket server connected on port ${WS_PORT}!`, SERVICES.socket)
        })
    }

    async execute() {
        await this.setupServices();
        Logger.debug('All services are online!', SERVICES.worker);

        const db = await this.mongoConnection.db(String(process.env.MONGODB_DB_NAME))
        Logger.debug(`Using database "${String(process.env.MONGODB_DB_NAME)}"`, SERVICES.worker);

        const sensorCol = await db.collection(process.env.MONGODB_COLLECTION_NAME)
        Logger.debug(`Using collection "${String(process.env.MONGODB_COLLECTION_NAME)}"`, SERVICES.mongodb);

        const handleMessage = async (msg: ConsumeMessage) => {
            if (msg) {
                let messageObj: Record<string, any> | undefined;

                try {
                    messageObj = JSON.parse(msg.content.toString())
                } catch (error) {
                    Logger.error(`Message is not a valid JSON: ${msg.content.toString()}`, SERVICES.worker);
                    return
                }

                if (!Object.keys(messageObj).length) {
                    Logger.error(`Message is not a valid JSON: ${msg.content.toString()}`, SERVICES.worker);
                    return
                }

                try {
                    let result: InsertOneResult<Document> | InsertManyResult<Document>;

                    if (Array.isArray(messageObj)) {
                        result = await sensorCol.insertMany(messageObj)

                        Logger.debug(`Dados enviados ao banco! IDS: ${Object.values(result.insertedIds)}`, SERVICES.mongodb);

                        for (const item of messageObj) {
                            if (item.hasOwnProperty('CompanyId')) {
                                await this.socketServer.emit(String(item.Companyid), item)
                            }
                        }

                        Logger.debug('Dados emitidos ao socket!', SERVICES.socket)
                    } else {
                        result = await sensorCol.insertOne(messageObj)

                        Logger.debug(`Dados enviados ao banco! ID: ${result.insertedId}`, SERVICES.mongodb);

                        if (messageObj.hasOwnProperty('CompanyId')) {
                            await this.socketServer.emit(String(messageObj.CompanyId), messageObj)
                            Logger.debug('Dados emitidos ao socket!', SERVICES.socket)
                        }
                    }
                } catch (error) {
                    Logger.error(`Erro ao salvar a mensagem no banco: ${error}`, SERVICES.mongodb);
                }
            }
        }

        const chanWrapper = await this.amqpConnection.createChannel({
            json: true,
            setup: (channel: Channel) =>
                Promise.all([
                    channel.assertExchange(String(process.env.EXCHANGE_NAME), 'direct', { durable: true }),
                    channel.assertQueue(String(process.env.QUEUE_NAME), {
                        durable: true,
                    }),
                    channel.consume(String(process.env.QUEUE_NAME), handleMessage, {
                        noAck: true
                    })
                ])
        })

        await chanWrapper.waitForConnect()

        Logger.verbose(`[*] Waiting for queue messages on ${String(process.env.QUEUE_NAME)}`, SERVICES.rabbitmq);
    }
}
