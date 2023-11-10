import { Injectable } from '@nestjs/common';
import { RabbitMQWorker } from 'src/workers/rabbitmq.worker';
import { format, subDays } from 'date-fns'

@Injectable()
export default class SensorService {
  async list(companyId: string, days?: number) {
    const rmq = RabbitMQWorker.getInstance();
    const db = await rmq.mongoConnection.db(
      String(process.env.MONGODB_DB_NAME),
    );
    const sensorCol = await db.collection(process.env.MONGODB_COLLECTION_NAME);

    if (days) {
      const data = await sensorCol
        .find({
          Value: {
            $type: 'number',
          },
          SensorId: 'S15',
          timestamp: {
            $gte: format(subDays(new Date(), days), 'yyyy-M-dd hh:mm:ss'),
            $lte: format(new Date(), 'yyyy-M-dd hh:mm:ss'),
          }
        })
        .sort({
          timestamp: 'asc',
        })
        .toArray();

      return data;
    }

    const data = await sensorCol
      .find({
        CompanyId: companyId,
        Value: {
          $type: 'number',
        },
        SensorId: 'S15',
        timestamp: {
          $gte: format(new Date(), 'yyyy-M-dd hh:mm:ss'),
          // $lte: format(new Date(), 'yyyy-M-dd hh:mm:ss'),
        }
      })
      .sort({
        timestamp: 'asc',
      })
      .toArray();

    return data;
  }
}
