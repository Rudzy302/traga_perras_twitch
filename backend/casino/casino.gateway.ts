import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { TwitchService } from '../twitch/twitch.service';
import { GamePickerService } from '../games/game-picker.service';

export interface StartSpinPayload {
  username: string;
  prize: number;
  duration: number; // en milisegundos (15000)
  prizesList: number[];
}

export interface SetCredentialsPayload {
  channel: string;
  botUsername?: string;
  oauthToken?: string;
  pointsCommand?: string;
  cooldownSeconds?: number;
  theme?: string;
  announceCountdown?: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class CasinoGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(CasinoGateway.name);

  constructor(
    @Inject(forwardRef(() => TwitchService))
    private readonly twitchService: TwitchService,
    @Inject(forwardRef(() => GamePickerService))
    private readonly gamePickerService: GamePickerService,
  ) { }

  afterInit(server: Server) {
    this.logger.log('🎰 Casino Gateway inicializado. Listo para conexiones OBS y panel de control.');
  }

  handleConnection(client: Socket) {
    this.logger.log(`🟢 Cliente conectado: ${client.id}`);
    // Enviar estado actual de conexión de Twitch y de la Selectora al cliente recién conectado
    if (this.twitchService) {
      client.emit('twitch-status', this.twitchService.getStatus());
    }
    if (this.gamePickerService) {
      client.emit('game-picker-state', this.gamePickerService.getState());
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`🔴 Cliente desconectado: ${client.id}`);
  }

  /**
   * Emite el evento 'start-spin' a todos los overlays de OBS conectados y vista previa.
   */
  emitStartSpin(payload: StartSpinPayload): void {
    this.logger.log(
      `📢 Emitiendo 'start-spin' para @${payload.username} con premio: ${payload.prize} pts`,
    );
    this.server.emit('start-spin', payload);
  }

  /**
   * Permite consultar el estado de conexión de Twitch desde el panel
   */
  @SubscribeMessage('get-twitch-status')
  handleGetStatus(client: Socket) {
    return this.twitchService.getStatus();
  }

  /**
   * Permite configurar cualquier canal y token de Twitch en caliente desde el panel web
   */
  @SubscribeMessage('set-twitch-credentials')
  async handleSetCredentials(client: Socket, payload: SetCredentialsPayload) {
    this.logger.log(`⚙️ Recibida nueva configuración para canal: ${payload.channel}`);
    const result = await this.twitchService.reconfigure(payload);
    this.server.emit('twitch-status', this.twitchService.getStatus());
    return result;
  }

  /**
   * Permite disparar una tirada de prueba desde el panel web
   */
  @SubscribeMessage('test-spin')
  handleTestSpin(client: Socket, payload?: { username?: string; prize?: number }) {
    const user = payload?.username || 'ViewerPrueba';
    const prize = payload?.prize || 500;
    this.logger.log(`🧪 Disparando tirada de prueba para @${user} (${prize} pts)`);
    this.emitStartSpin({
      username: user,
      prize,
      duration: 15000,
      prizesList: this.twitchService ? this.twitchService.ALL_PRIZES_POOL : [],
    });
    return { success: true };
  }

  /**
   * Permite reiniciar el temporizador de cooldown desde el panel web
   */
  @SubscribeMessage('reset-cooldown')
  handleResetCooldown(client: Socket) {
    if (this.twitchService) {
      this.twitchService.resetCooldown();
      this.server.emit('twitch-status', this.twitchService.getStatus());
    }
    return { success: true, message: 'Cooldown reiniciado con éxito' };
  }

  /**
   * Emite el estado actualizado de Twitch a todos los clientes
   */
  emitTwitchStatus(status: any): void {
    if (this.server) {
      this.server.emit('twitch-status', status);
    }
  }

  /**
   * Permite probar la cuenta regresiva en el chat de Twitch desde el panel
   */
  @SubscribeMessage('test-countdown')
  async handleTestCountdown(client: Socket) {
    if (this.twitchService) {
      return await this.twitchService.triggerTestCountdown();
    }
    return { success: false, message: 'Servicio de Twitch no disponible' };
  }

  /**
   * Permite modificar el tiempo de cooldown directamente desde el panel web
   */
  @SubscribeMessage('set-cooldown')
  handleSetCooldown(client: Socket, payload: { cooldownSeconds: number }) {
    if (this.twitchService && payload && payload.cooldownSeconds !== undefined) {
      const result = this.twitchService.setCooldownSeconds(Number(payload.cooldownSeconds));
      this.server.emit('twitch-status', this.twitchService.getStatus());
      return result;
    }
    return { success: false, message: 'Valor de cooldown inválido' };
  }

  /**
   * Permite cambiar el tema visual y sincronizarlo con todos los clientes y OBS
   */
  @SubscribeMessage('set-theme')
  handleSetTheme(client: Socket, payload: { theme: string }) {
    if (this.twitchService && payload?.theme) {
      const result = this.twitchService.setTheme(payload.theme);
      this.server.emit('theme-change', payload.theme);
      this.server.emit('twitch-status', this.twitchService.getStatus());
      return result;
    }
    return { success: false };
  }

  /**
   * Permite activar o desactivar los avisos de cuenta regresiva en el chat
   */
  @SubscribeMessage('set-countdown-announcement')
  handleSetCountdownAnnouncement(client: Socket, payload: { enabled: boolean }) {
    if (this.twitchService && payload) {
      const result = this.twitchService.setCountdownAnnouncement(Boolean(payload.enabled));
      this.server.emit('twitch-status', this.twitchService.getStatus());
      return result;
    }
    return { success: false };
  }

  /**
   * Permite resetear manualmente la racha de tiradas consecutivas anti-campeo
   */
  @SubscribeMessage('reset-consecutive-spins')
  handleResetConsecutiveSpins(client: Socket) {
    if (this.twitchService) {
      this.twitchService.resetConsecutiveSpins();
      this.server.emit('twitch-status', this.twitchService.getStatus());
      return { success: true, message: 'Racha anti-campeo reseteada exitosamente' };
    }
    return { success: false };
  }

  // =========================================================================
  // EVENTOS Y MÉTODOS PARA LA SELECTORA DE JUEGOS
  // =========================================================================

  emitGamePickerState(state: any): void {
    if (this.server) {
      this.server.emit('game-picker-state', state);
    }
  }

  emitGamePickerSpinStarted(payload: any): void {
    if (this.server) {
      this.server.emit('game-picker-spin-started', payload);
    }
  }

  @SubscribeMessage('get-game-picker-state')
  handleGetGamePickerState(client: Socket) {
    return this.gamePickerService.getState();
  }

  @SubscribeMessage('search-game-picker-catalog')
  handleSearchGameCatalog(client: Socket, payload: { query?: string; page?: number; pageSize?: number }) {
    return this.gamePickerService.searchCatalog(payload?.query || '', payload?.page || 1, payload?.pageSize || 10);
  }

  @SubscribeMessage('start-game-picker-voting')
  handleStartGamePickerVoting(client: Socket, payload: { durationSeconds: number }) {
    this.gamePickerService.startVoting(payload?.durationSeconds || 120);
    return { success: true };
  }

  @SubscribeMessage('stop-game-picker-voting')
  handleStopGamePickerVoting(client: Socket) {
    this.gamePickerService.stopVotingManual();
    return { success: true };
  }

  @SubscribeMessage('enable-game')
  handleEnableGame(client: Socket, payload: { id: string }) {
    const success = this.gamePickerService.enableGame(payload?.id);
    return { success };
  }

  @SubscribeMessage('disable-game')
  handleDisableGame(client: Socket, payload: { id: string }) {
    const success = this.gamePickerService.disableGame(payload?.id);
    return { success };
  }

  @SubscribeMessage('add-custom-game')
  handleAddCustomGame(client: Socket, payload: { name: string; category?: string }) {
    if (payload?.name) {
      const created = this.gamePickerService.addCustomGame(payload.name, payload.category);
      return { success: true, game: created };
    }
    return { success: false, message: 'Nombre de juego requerido' };
  }

  @SubscribeMessage('reset-game-won-history')
  handleResetGameWonHistory(client: Socket) {
    this.gamePickerService.resetPreviouslyWonGames();
    return { success: true };
  }

  @SubscribeMessage('set-game-picker-theme')
  handleSetGamePickerTheme(client: Socket, payload: { theme: string }) {
    if (payload?.theme) {
      this.gamePickerService.setTheme(payload.theme);
      return { success: true };
    }
    return { success: false };
  }
}


