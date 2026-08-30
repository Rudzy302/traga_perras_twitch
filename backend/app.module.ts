import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CasinoGateway } from './casino/casino.gateway';
import { TwitchService } from './twitch/twitch.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  providers: [CasinoGateway, TwitchService],
  exports: [CasinoGateway, TwitchService],
})
export class AppModule { }
