import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import * as tmi from 'tmi.js';
import * as fs from 'fs';
import * as path from 'path';
import { CasinoGateway } from '../casino/casino.gateway';

export interface TwitchConfig {
  channel: string;
  botUsername?: string;
  oauthToken?: string;
  pointsCommand?: string;
  cooldownSeconds?: number;
}

export interface PrizeTier {
  weight: number; // Probabilidad relativa
  prizes: number[];
}

@Injectable()
export class TwitchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TwitchService.name);
  private client: tmi.Client | null = null;
  private isAuthenticated = false;

  private currentChannel = process.env.TWITCH_CHANNEL || '';
  private currentBotUsername = process.env.TWITCH_BOT_USERNAME || '';
  private currentOauthToken = process.env.TWITCH_OAUTH_TOKEN || '';
  private pointsCommandPattern = process.env.POINTS_COMMAND || '!points add {user} {prize}';

  // Configuración de tiempos
  private readonly SPIN_DURATION_MS = 16000; // 16s (tragaperras dura 15s)

  // Cooldown de 5 MINUTOS exactos (300 segundos) para respetar la regla de BotRix
  private cooldownMs = 5 * 60 * 1000; // 300,000 ms

  // =========================================================================
  // SISTEMA DE PREMIOS TIPO JACKPOT (DE 1 HASTA 100,000 PUNTOS)
  // Distribución ponderada: alta probabilidad en números bajos, bajísima en Jackpot
  // =========================================================================
  private readonly PRIZE_TIERS: PrizeTier[] = [
    // TIER 1 (Muy Frecuente - 55% de probabilidad): 0 a 50 puntos
    {
      weight: 55,
      prizes: [0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
    },
    // TIER 2 (Frecuente - 25% de probabilidad): 60 a 500 puntos
    {
      weight: 25,
      prizes: [60, 75, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500],
    },
    // TIER 3 (Moderado - 13% de probabilidad): 600 a 3,000 puntos
    {
      weight: 13,
      prizes: [600, 750, 1000, 1250, 1500, 2000, 2500, 3000],
    },
    // TIER 4 (Raro - 6% de probabilidad): 4,000 a 25,000 puntos
    {
      weight: 6,
      prizes: [4000, 5000, 7500, 10000, 15000, 20000, 25000],
    },
    // TIER 5 (🌟 ULTRA RARO / JACKPOT - 1% de probabilidad): 50,000 y 100,000 puntos
    {
      weight: 1,
      prizes: [50000, 100000],
    },
  ];

  // Pool completo para el tambor visual del tragamonedas (todos los números variados)
  public readonly ALL_PRIZES_POOL: number[] = [
    0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
    60, 75, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500,
    600, 750, 1000, 1250, 1500, 2000, 2500, 3000,
    4000, 5000, 7500, 10000, 15000, 20000, 25000,
    50000, 100000,
  ];

  // Estados de control
  private isSpinActive = false;
  private lastSpinTimestamp = 0;
  private recentSpinUsers = new Map<string, number>();

  constructor(
    @Inject(forwardRef(() => CasinoGateway))
    private readonly casinoGateway: CasinoGateway,
  ) { }

  async onModuleInit() {
    this.currentChannel = process.env.TWITCH_CHANNEL || '';
    this.currentBotUsername = process.env.TWITCH_BOT_USERNAME || this.currentChannel;
    this.currentOauthToken = process.env.TWITCH_OAUTH_TOKEN || '';
    this.pointsCommandPattern = process.env.POINTS_COMMAND || '!points add {user} {prize}';

    const envCooldown = process.env.COOLDOWN_SECONDS;
    if (envCooldown && !isNaN(Number(envCooldown))) {
      this.cooldownMs = Number(envCooldown) * 1000;
      this.logger.log(`⏱️ Cooldown configurado a ${envCooldown} segundos.`);
    } else {
      this.cooldownMs = 5 * 60 * 1000; // 5 minutos por defecto
      this.logger.log('⏱️ Cooldown configurado a 5 MINUTOS (300 segundos).');
    }

    if (this.currentChannel.trim() !== '') {
      await this.connectToTwitch();
    } else {
      this.logger.warn(
        'ℹ️ Aún no se ha configurado un canal de Twitch. Abre http://localhost:3000 para configurar tu canal.',
      );
    }
  }

  async onModuleDestroy() {
    await this.disconnectFromTwitch();
  }

  private async disconnectFromTwitch(): Promise<void> {
    if (this.client) {
      try {
        await this.client.disconnect();
      } catch { }
      this.client = null;
    }
    this.isAuthenticated = false;
  }

  /**
   * Conecta a Twitch Chat con las credenciales configuradas
   */
  private async connectToTwitch(): Promise<void> {
    await this.disconnectFromTwitch();

    if (!this.currentChannel || this.currentChannel.trim() === '') {
      this.logger.warn('⚠️ No se puede conectar a Twitch: Canal vacío.');
      return;
    }

    const channelName = this.currentChannel.trim().replace(/^#/, '');
    const formattedChannel = `#${channelName.toLowerCase()}`;

    const clientOptions: tmi.Options = {
      options: { debug: false },
      connection: {
        secure: true,
        reconnect: true,
      },
      channels: [formattedChannel],
    };

    if (this.currentOauthToken.trim() !== '') {
      const oauthPassword = this.currentOauthToken.startsWith('oauth:')
        ? this.currentOauthToken
        : `oauth:${this.currentOauthToken}`;

      const botUser = (this.currentBotUsername || channelName).trim().replace(/^@/, '');

      clientOptions.identity = {
        username: botUser.toLowerCase(),
        password: oauthPassword,
      };
      this.isAuthenticated = true;
      this.logger.log(
        `🔐 MODO AUTENTICADO ACTIVO como @${clientOptions.identity.username} en canal ${formattedChannel}. Los premios se enviarán automáticamente.`,
      );
    } else {
      this.isAuthenticated = false;
      this.logger.warn(
        `👀 MODO SÓLO LECTURA activo para ${formattedChannel}. Falta TWITCH_OAUTH_TOKEN para que el bot pueda enviar puntos automáticamente.`,
      );
    }

    this.client = new tmi.Client(clientOptions);

    this.client.on('message', (chan, tags, message, self) => {
      this.handleChatMessage(chan, tags, message, self);
    });

    this.client.on('connected', (address, port) => {
      this.logger.log(
        `✅ CONEXIÓN EXITOSA con Twitch Chat (${address}:${port}) en canal: ${formattedChannel}`,
      );
    });

    try {
      await this.client.connect();
    } catch (error) {
      this.logger.error(`❌ Error conectando al chat de ${formattedChannel}:`, error);
    }
  }

  /**
   * Selecciona un premio según la distribución ponderada tipo Jackpot
   */
  public selectWeightedJackpotPrize(): number {
    const totalWeight = this.PRIZE_TIERS.reduce((sum, tier) => sum + tier.weight, 0);
    let random = Math.random() * totalWeight;

    for (const tier of this.PRIZES_TIERS_SAFE) {
      if (random < tier.weight) {
        return tier.prizes[Math.floor(Math.random() * tier.prizes.length)];
      }
      random -= tier.weight;
    }

    return 10;
  }

  private get PRIZES_TIERS_SAFE(): PrizeTier[] {
    return this.PRIZE_TIERS;
  }

  /**
   * Procesa los mensajes del chat y respeta el cooldown
   */
  private async handleChatMessage(
    channel: string,
    tags: tmi.ChatUserstate,
    message: string,
    self: boolean,
  ): Promise<void> {
    const trimmedMsg = message.trim();
    const sender = tags['display-name'] || tags.username || 'usuario';

    // Evitar procesar nuestros propios mensajes de comando para no hacer bucles
    if (
      trimmedMsg.startsWith('!points add') ||
      trimmedMsg.startsWith('!p ') ||
      trimmedMsg === '!p'
    ) {
      return;
    }

    this.logger.log(`💬 [Chat ${channel}] ${sender}: ${trimmedMsg}`);

    // Detección si BotRix rechaza por cooldown ("the item is on cooldown")
    if (trimmedMsg.toLowerCase().includes('the item is on cooldown') || trimmedMsg.toLowerCase().includes('is on cooldown')) {
      this.logger.warn(`⛔ [Cooldown Detectado] BotRix rechazó la tirada: ${trimmedMsg}.`);
      this.isSpinActive = false;
      return;
    }

    // Comando manual para que el streamer resetee el cooldown cuando quiera hacer pruebas
    if (
      trimmedMsg.toLowerCase() === '!resetcooldown' ||
      trimmedMsg.toLowerCase() === '!ruletareset'
    ) {
      this.resetCooldown();
      return;
    }

    // =========================================================================
    // CASO 1: DETECCIÓN DEL MENSAJE DE BOTRIX CON PREMIO YA CALCULADO
    // =========================================================================
    const botrixRegex = /@?(\w+)\s+(\d+)\s+pts\.\s+GANADOS\s+EN\s+LA\s+RULETAAAA/i;
    const botrixMatch = trimmedMsg.match(botrixRegex);

    if (botrixMatch) {
      const targetUser = botrixMatch[1];
      const botrixPrize = parseInt(botrixMatch[2], 10);

      this.logger.log(
        `🎯 [BotRix Detectado] @${targetUser} ganó ${botrixPrize} pts. Ejecutando ruleta...`,
      );
      await this.executeSpinFlow(channel, targetUser, botrixPrize, false);
      return;
    }

    // =========================================================================
    // CASO 2: CANJE DE TIENDA O COMANDO !spin
    // =========================================================================
    const spinMatch = trimmedMsg.match(/^!spin(?:\s+@?(\w+))?/i);
    if (spinMatch && !trimmedMsg.toLowerCase().startsWith('!ruleta')) {
      const targetUser = (spinMatch[1] || sender).replace(/^@/, '');

      const lastUserSpin = this.recentSpinUsers.get(targetUser.toLowerCase()) || 0;
      if (Date.now() - lastUserSpin < 3000) {
        return;
      }

      this.logger.log(`🎰 [Comando !spin Detectado] para @${targetUser}`);
      const weightedPrize = this.selectWeightedJackpotPrize();
      await this.executeSpinFlow(channel, targetUser, weightedPrize, false);
      return;
    }

    // =========================================================================
    // CASO 3: SECUENCIA !ruleta -> !spin -> pago
    // =========================================================================
    const firstWord = trimmedMsg.toLowerCase().split(' ')[0];
    if (firstWord === '!ruleta' || firstWord === '!ruletaa') {
      const user = sender.replace(/^@/, '');

      const lastUserSpin = this.recentSpinUsers.get(user.toLowerCase()) || 0;
      if (Date.now() - lastUserSpin < 3000) {
        return;
      }

      this.logger.log(`🎰 [Comando !ruleta Detectado] @${user} ejecutó ${firstWord}`);
      const weightedPrize = this.selectWeightedJackpotPrize();

      await this.executeSpinFlow(channel, user, weightedPrize, true);
    }
  }

  /**
   * Orquesta la secuencia completa respetando el cooldown
   */
  private async executeSpinFlow(
    channel: string,
    username: string,
    prize: number,
    triggerSpinCmd: boolean,
  ): Promise<void> {
    const now = Date.now();

    // Cooldown
    const timeSinceLastSpin = now - this.lastSpinTimestamp;
    if (this.lastSpinTimestamp > 0 && timeSinceLastSpin < this.cooldownMs) {
      const remainingSeconds = Math.ceil((this.cooldownMs - timeSinceLastSpin) / 1000);
      const remainingMinutes = Math.floor(remainingSeconds / 60);
      const remainingSecs = remainingSeconds % 60;
      this.logger.warn(
        `⛔ Ruleta pausada para @${username}: Cooldown activo (${remainingMinutes}m ${remainingSecs}s restantes). Puedes resetear con '!resetcooldown'`,
      );
      return;
    }

    if (this.isSpinActive) {
      this.logger.warn(`⛔ Ruleta pausada para @${username}: Ya hay una tirada en curso.`);
      return;
    }

    this.isSpinActive = true;
    this.lastSpinTimestamp = now;
    this.recentSpinUsers.set(username.toLowerCase(), now);

    try {
      this.logger.log(
        `🚀 [SECUENCIA CASINO INICIADA] Usuario: @${username} | Premio: ${prize.toLocaleString()} pts`,
      );

      // PASO 1: Si vino por !ruleta, ejecutar '!spin @usuario'
      if (triggerSpinCmd && this.client && this.isAuthenticated) {
        const spinCmd = `!spin @${username}`;
        await this.client.say(channel, spinCmd);
        this.logger.log(`⏩ [PASO 1 ENVIADO COMO @${this.currentBotUsername}] ${spinCmd}`);
      }

      // PASO 2: Emitir evento WebSocket a OBS con el pool completo
      this.casinoGateway.emitStartSpin({
        username,
        prize,
        duration: 15000,
        prizesList: this.ALL_PRIZES_POOL,
      });

      // PASO 3: Esperar 16 segundos exactos (tragaperras dura 15s)
      this.logger.log('⏳ [PASO 2] Animación en OBS en progreso... Pago en 16s.');
      await this.sleep(this.SPIN_DURATION_MS);

      // PASO 4: Enviar comando de recompensa en el chat
      const cleanUser = username.replace(/^@/, '');
      let payCommand = this.pointsCommandPattern
        .replace(/{user}/g, cleanUser)
        .replace(/{prize}/g, prize.toString());

      // Si el comando no contiene variables, construir comando por defecto
      if (!this.pointsCommandPattern.includes('{user}')) {
        payCommand = `!points add ${cleanUser} ${prize}`;
      }

      if (this.client && this.isAuthenticated) {
        await this.client.say(channel, payCommand);
        this.logger.log(`💰 [PASO 3 FINALIZADO - PAGO ENVIADO COMO @${this.currentBotUsername}] ${payCommand}`);
      } else {
        this.logger.warn(
          `⚠️ [TIRADA FINALIZADA (+${prize.toLocaleString()} pts para @${cleanUser})] -> Falta Token OAuth para enviar '${payCommand}' automáticamente. Configúralo en http://localhost:3000`,
        );
      }
    } catch (error) {
      this.logger.error(`❌ Error en tirada para @${username}:`, error);
    } finally {
      this.isSpinActive = false;
      this.scheduleCooldownAnnouncements(channel);
    }
  }

  private cooldownTimers: NodeJS.Timeout[] = [];

  private clearCooldownTimers(): void {
    for (const t of this.cooldownTimers) {
      clearTimeout(t);
    }
    this.cooldownTimers = [];
  }

  /**
   * Envía un mensaje al chat de Twitch autenticado con la cuenta del streamer
   */
  public async sendChatMessage(channel: string, message: string): Promise<boolean> {
    if (!this.client || !this.isAuthenticated) {
      this.logger.warn(`⚠️ [AVISO EN CHAT NO ENVIADO] Falta autenticación de Twitch: ${message}`);
      return false;
    }
    try {
      const cleanChannel = channel.replace(/^#/, '');
      await this.client.say(cleanChannel, message);
      this.logger.log(`📢 [CHAT #${cleanChannel}] @${this.currentBotUsername}: ${message}`);
      return true;
    } catch (error) {
      this.logger.error(`❌ Error enviando mensaje a #${channel}:`, error);
      return false;
    }
  }

  /**
   * Programa la cuenta regresiva en el chat de Twitch: 3, 2, 1... ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!
   */
  public scheduleCooldownAnnouncements(channel: string): void {
    this.clearCooldownTimers();

    if (!channel) return;

    const cooldownEndsAt = this.lastSpinTimestamp + this.cooldownMs;
    const msRemaining = cooldownEndsAt - Date.now();

    if (msRemaining <= 0) {
      this.sendChatMessage(
        channel,
        '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !ruleta para girar 🎰✨',
      ).catch(() => {});
      return;
    }

    this.logger.log(
      `📢 Programando cuenta regresiva en el chat para el cooldown (${Math.round(msRemaining / 1000)}s restantes)...`,
    );

    // T - 3s
    if (msRemaining > 3000) {
      const t3 = setTimeout(() => {
        this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 3...');
      }, msRemaining - 3000);
      this.cooldownTimers.push(t3);
    }

    // T - 2s
    if (msRemaining > 2000) {
      const t2 = setTimeout(() => {
        this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 2...');
      }, msRemaining - 2000);
      this.cooldownTimers.push(t2);
    }

    // T - 1s
    if (msRemaining > 1000) {
      const t1 = setTimeout(() => {
        this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 1...');
      }, msRemaining - 1000);
      this.cooldownTimers.push(t1);
    }

    // T - 0s: Ruleta ya disponible
    const t0 = setTimeout(() => {
      this.sendChatMessage(
        channel,
        '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !ruleta para girar 🎰✨',
      );
      this.logger.log('🎉 [AVISO ENVIADO] ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!');
      this.casinoGateway.emitTwitchStatus(this.getStatus());
    }, msRemaining);
    this.cooldownTimers.push(t0);
  }

  /**
   * Ejecuta una cuenta regresiva de prueba en el chat (3, 2, 1, ¡RULETA YA DISPONIBLE!)
   */
  public async triggerTestCountdown(): Promise<{ success: boolean; message: string }> {
    if (!this.currentChannel || !this.client || !this.isAuthenticated) {
      return {
        success: false,
        message: 'No estás autenticado en Twitch. Conecta tu canal y token primero.',
      };
    }

    const channel = this.currentChannel;
    await this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 3...');
    setTimeout(() => {
      this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 2...');
    }, 1000);
    setTimeout(() => {
      this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 1...');
    }, 2000);
    setTimeout(() => {
      this.sendChatMessage(
        channel,
        '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !ruleta para girar 🎰✨',
      );
    }, 3000);

    return {
      success: true,
      message: 'Cuenta regresiva iniciada en tu chat de Twitch (3, 2, 1... ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!)',
    };
  }

  /**
   * Resetea el temporizador de cooldown
   */
  public resetCooldown(): void {
    this.clearCooldownTimers();
    this.lastSpinTimestamp = 0;
    this.isSpinActive = false;
    this.logger.log('🔄 Cooldown de tiradas reiniciado manualmente.');
    if (this.currentChannel && this.client && this.isAuthenticated) {
      this.sendChatMessage(
        this.currentChannel,
        '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !ruleta para girar 🎰✨',
      ).catch(() => {});
    }
  }

  /**
   * Modifica el tiempo de cooldown en segundos y lo persiste en .env
   */
  public setCooldownSeconds(seconds: number): { success: boolean; message: string } {
    if (!isNaN(seconds) && seconds >= 0) {
      this.cooldownMs = seconds * 1000;
      this.logger.log(`⏱️ Cooldown modificado a ${seconds} segundos (${Math.round(seconds / 60)} min).`);

      try {
        const envContent = [
          `# =========================================================================`,
          `# CONFIGURACIÓN DEL CASINO TWITCH`,
          `# =========================================================================`,
          `TWITCH_CHANNEL=${this.currentChannel}`,
          `TWITCH_BOT_USERNAME=${this.currentBotUsername}`,
          `TWITCH_OAUTH_TOKEN=${this.currentOauthToken}`,
          `POINTS_COMMAND=${this.pointsCommandPattern}`,
          `COOLDOWN_SECONDS=${Math.round(this.cooldownMs / 1000)}`,
          `PORT=${process.env.PORT || 3000}`,
        ].join('\n');

        const candidatePaths = [
          path.resolve(process.cwd(), '.env'),
          path.resolve(process.cwd(), 'backend', '.env'),
          path.resolve(process.cwd(), '..', 'backend', '.env'),
        ];
        for (const p of candidatePaths) {
          try {
            if (fs.existsSync(path.dirname(p))) {
              fs.writeFileSync(p, envContent, 'utf-8');
            }
          } catch {}
        }
      } catch {}

      if (this.currentChannel) {
        this.scheduleCooldownAnnouncements(this.currentChannel);
      }

      return {
        success: true,
        message: `Cooldown actualizado a ${seconds} segundos (${Math.round(seconds / 60)} min)`,
      };
    }
    return { success: false, message: 'Valor de cooldown inválido' };
  }

  /**
   * Reconfiguración dinámica en caliente desde el panel web
   */
  public async reconfigure(config: TwitchConfig): Promise<{ success: boolean; message: string }> {
    this.currentChannel = (config.channel || '').trim().replace(/^#/, '');
    this.currentBotUsername = ((config.botUsername || this.currentChannel) || '').trim().replace(/^@/, '');
    this.currentOauthToken = (config.oauthToken || '').trim();

    if (config.pointsCommand && config.pointsCommand.trim() !== '') {
      this.pointsCommandPattern = config.pointsCommand.trim();
    }

    if (config.cooldownSeconds && !isNaN(Number(config.cooldownSeconds))) {
      this.cooldownMs = Number(config.cooldownSeconds) * 1000;
    }

    try {
      const envContent = [
        `# =========================================================================`,
        `# CONFIGURACIÓN DEL CASINO TWITCH`,
        `# =========================================================================`,
        `TWITCH_CHANNEL=${this.currentChannel}`,
        `TWITCH_BOT_USERNAME=${this.currentBotUsername}`,
        `TWITCH_OAUTH_TOKEN=${this.currentOauthToken}`,
        `POINTS_COMMAND=${this.pointsCommandPattern}`,
        `COOLDOWN_SECONDS=${Math.round(this.cooldownMs / 1000)}`,
        `PORT=${process.env.PORT || 3000}`,
      ].join('\n');

      const candidatePaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), 'backend', '.env'),
        path.resolve(process.cwd(), '..', 'backend', '.env'),
      ];
      let saved = false;
      for (const p of candidatePaths) {
        try {
          if (fs.existsSync(path.dirname(p))) {
            fs.writeFileSync(p, envContent, 'utf-8');
            this.logger.log(`💾 Configuración guardada en ${p}`);
            saved = true;
          }
        } catch {}
      }
      if (!saved) {
        fs.writeFileSync(path.resolve(process.cwd(), '.env'), envContent, 'utf-8');
      }
    } catch (e) {
      this.logger.warn('No se pudo escribir en .env, usando configuración en memoria.');
    }

    if (this.currentChannel) {
      await this.connectToTwitch();
      return {
        success: true,
        message: `Conectado exitosamente como @${this.currentBotUsername || this.currentChannel} en #${this.currentChannel}`,
      };
    } else {
      await this.disconnectFromTwitch();
      return {
        success: true,
        message: 'Configuración guardada (sin canal activo).',
      };
    }
  }

  public getStatus() {
    return {
      channel: this.currentChannel,
      botUsername: this.currentBotUsername,
      oauthToken: this.currentOauthToken,
      isAuthenticated: this.isAuthenticated,
      isSpinActive: this.isSpinActive,
      cooldownSeconds: Math.round(this.cooldownMs / 1000),
      pointsCommand: this.pointsCommandPattern,
      isConfigured: Boolean(this.currentChannel && this.currentChannel.trim() !== ''),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

