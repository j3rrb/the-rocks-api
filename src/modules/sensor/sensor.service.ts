import { Injectable } from '@nestjs/common'
import { RabbitMQWorker } from 'src/workers/rabbitmq.worker'

@Injectable()
export default class SensorService {
    async list(companyId: string, days?: number) {
        const rmq = RabbitMQWorker.getInstance()
        const db = await rmq.mongoConnection.db(String(process.env.MONGODB_DB_NAME))
        const sensorCol = await db.collection(process.env.MONGODB_COLLECTION_NAME)

        if (days) {
            const data = await sensorCol.find({
                Value: {
                    $type: 'number'
                }
            }).limit(100).toArray()

            return data
        }

        const data = await sensorCol.find({
            CompanyId: companyId,
            Value: {
                $type: 'number'
            }
        }).limit(100).toArray()

        return data
    }
}
