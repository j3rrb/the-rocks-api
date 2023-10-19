import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export default class PopulateDBJob {
  @Cron('* * */30 * *')
  async execute() {}
}
