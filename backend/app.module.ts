import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CasinoGateway } from './casino/casino.gateway';
import { TwitchService } from './twitch/twitch.service';

import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '..', '.env'),
        path.resolve(process.cwd(), 'backend', '.env'),
        path.resolve(__dirname, '..', '..', '.env'),
        path.resolve(__dirname, '..', '.env'),
      ],
    }),
  ],
  providers: [CasinoGateway, TwitchService],
  exports: [CasinoGateway, TwitchService],
})
export class AppModule { }
