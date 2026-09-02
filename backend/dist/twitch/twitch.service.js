"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TwitchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwitchService = void 0;
const common_1 = require("@nestjs/common");
const tmi = require("tmi.js");
const fs = require("fs");
const path = require("path");
const casino_gateway_1 = require("../casino/casino.gateway");
let TwitchService = TwitchService_1 = class TwitchService {
    constructor(casinoGateway) {
        this.casinoGateway = casinoGateway;
        this.logger = new common_1.Logger(TwitchService_1.name);
        this.client = null;
        this.isAuthenticated = false;
        this.authError = null;
        this.currentChannel = '';
        this.currentBotUsername = '';
        this.currentOauthToken = '';
        this.pointsCommandPattern = '!points add {user} {prize}';
        this.currentTheme = 'carnival-green';
        this.announceCountdownInChat = true;
        this.SPIN_DURATION_MS = 15500;
        this.cooldownMs = 5 * 60 * 1000;
        this.PRIZE_TIERS = [
            {
                weight: 55,
                prizes: [0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50],
            },
            {
                weight: 25,
                prizes: [60, 75, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500],
            },
            {
                weight: 13,
                prizes: [600, 750, 1000, 1250, 1500, 2000, 2500, 3000],
            },
            {
                weight: 6,
                prizes: [4000, 5000, 7500, 10000, 15000, 20000, 25000],
            },
            {
                weight: 1,
                prizes: [50000, 100000],
            },
        ];
        this.ALL_PRIZES_POOL = [
            0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50,
            60, 75, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500,
            600, 750, 1000, 1250, 1500, 2000, 2500, 3000,
            4000, 5000, 7500, 10000, 15000, 20000, 25000,
            50000, 100000,
        ];
        this.isSpinActive = false;
        this.lastSpinTimestamp = 0;
        this.recentSpinUsers = new Map();
        this.lastConsecutiveUser = null;
        this.consecutiveSpinsCount = 0;
        this.MAX_CONSECUTIVE_SPINS = 2;
        this.cooldownTimers = [];
    }
    async onModuleInit() {
        this.loadConfigFromDisk();
        this.logger.log(`⏱️ Cooldown configurado a ${Math.round(this.cooldownMs / 1000)} segundos.`);
        if (this.currentChannel.trim() !== '') {
            await this.connectToTwitch();
        }
        else {
            this.logger.warn('ℹ️ Aún no se ha configurado un canal de Twitch. Abre http://localhost:3000 para configurar tu canal.');
        }
    }
    async onModuleDestroy() {
        await this.disconnectFromTwitch();
    }
    getCandidateFilePaths(fileName) {
        const cwd = process.cwd();
        return [
            path.resolve(cwd, fileName),
            path.resolve(cwd, 'backend', fileName),
            path.resolve(cwd, '..', fileName),
            path.resolve(__dirname, '..', '..', fileName),
            path.resolve(__dirname, '..', fileName),
            path.resolve(__dirname, fileName),
        ];
    }
    saveConfigToDisk(data) {
        const jsonStr = JSON.stringify(data, null, 2);
        const envContent = [
            `# =========================================================================`,
            `# CONFIGURACIÓN DEL CASINO TWITCH - PERSISTENCIA PERMANENTE`,
            `# =========================================================================`,
            `TWITCH_CHANNEL=${data.channel}`,
            `TWITCH_BOT_USERNAME=${data.botUsername}`,
            `TWITCH_OAUTH_TOKEN=${data.oauthToken}`,
            `POINTS_COMMAND=${data.pointsCommand}`,
            `COOLDOWN_SECONDS=${data.cooldownSeconds}`,
            `THEME=${data.theme || 'carnival-green'}`,
            `ANNOUNCE_COUNTDOWN=${data.announceCountdown ? 'true' : 'false'}`,
            `PORT=${process.env.PORT || 3000}`,
        ].join('\n');
        for (const p of this.getCandidateFilePaths('casino_config.json')) {
            try {
                const dir = path.dirname(p);
                if (fs.existsSync(dir)) {
                    fs.writeFileSync(p, jsonStr, 'utf-8');
                    this.logger.log(`💾 [Config JSON Guardado]: ${p}`);
                }
            }
            catch { }
        }
        for (const p of this.getCandidateFilePaths('.env')) {
            try {
                const dir = path.dirname(p);
                if (fs.existsSync(dir)) {
                    fs.writeFileSync(p, envContent, 'utf-8');
                    this.logger.log(`💾 [.env Guardado]: ${p}`);
                }
            }
            catch { }
        }
    }
    loadConfigFromDisk() {
        for (const p of this.getCandidateFilePaths('casino_config.json')) {
            try {
                if (fs.existsSync(p)) {
                    const raw = fs.readFileSync(p, 'utf-8');
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') {
                        this.currentChannel = (parsed.channel || '').trim();
                        this.currentBotUsername = (parsed.botUsername || this.currentChannel).trim();
                        this.currentOauthToken = (parsed.oauthToken || '').trim();
                        this.pointsCommandPattern = parsed.pointsCommand || '!points add {user} {prize}';
                        this.cooldownMs = (Number(parsed.cooldownSeconds) || 300) * 1000;
                        this.currentTheme = parsed.theme || 'carnival-green';
                        this.announceCountdownInChat = parsed.announceCountdown !== undefined ? Boolean(parsed.announceCountdown) : true;
                        this.logger.log(`📂 [Config Cargada desde JSON ${p}]: Canal #${this.currentChannel} | Cooldown ${parsed.cooldownSeconds}s`);
                        return;
                    }
                }
            }
            catch { }
        }
        for (const p of this.getCandidateFilePaths('.env')) {
            try {
                if (fs.existsSync(p)) {
                    const raw = fs.readFileSync(p, 'utf-8');
                    const lines = raw.split('\n');
                    const envMap = {};
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                            const idx = trimmed.indexOf('=');
                            const key = trimmed.substring(0, idx).trim();
                            const val = trimmed.substring(idx + 1).trim();
                            envMap[key] = val;
                        }
                    }
                    if (envMap.TWITCH_CHANNEL) {
                        this.currentChannel = (envMap.TWITCH_CHANNEL || '').trim();
                        this.currentBotUsername = (envMap.TWITCH_BOT_USERNAME || this.currentChannel).trim();
                        this.currentOauthToken = (envMap.TWITCH_OAUTH_TOKEN || '').trim();
                        this.pointsCommandPattern = envMap.POINTS_COMMAND || '!points add {user} {prize}';
                        this.cooldownMs = (Number(envMap.COOLDOWN_SECONDS) || 300) * 1000;
                        this.currentTheme = envMap.THEME || 'carnival-green';
                        this.announceCountdownInChat = envMap.ANNOUNCE_COUNTDOWN !== undefined ? envMap.ANNOUNCE_COUNTDOWN === 'true' : true;
                        this.logger.log(`📂 [Config Cargada desde .env ${p}]: Canal #${this.currentChannel}`);
                        return;
                    }
                }
            }
            catch { }
        }
        this.currentChannel = process.env.TWITCH_CHANNEL || '';
        this.currentBotUsername = process.env.TWITCH_BOT_USERNAME || this.currentChannel;
        this.currentOauthToken = process.env.TWITCH_OAUTH_TOKEN || '';
        this.pointsCommandPattern = process.env.POINTS_COMMAND || '!points add {user} {prize}';
        this.cooldownMs = (Number(process.env.COOLDOWN_SECONDS) || 300) * 1000;
        this.currentTheme = 'carnival-green';
        this.announceCountdownInChat = true;
    }
    async disconnectFromTwitch() {
        if (this.client) {
            try {
                await this.client.disconnect();
            }
            catch { }
            this.client = null;
        }
        this.isAuthenticated = false;
    }
    async connectToTwitch() {
        await this.disconnectFromTwitch();
        if (!this.currentChannel || this.currentChannel.trim() === '') {
            this.logger.warn('⚠️ No se puede conectar a Twitch: Canal vacío.');
            return;
        }
        const cleanChannel = this.currentChannel.replace(/^#/, '').toLowerCase().trim();
        const botNick = (this.currentBotUsername || cleanChannel).replace(/^@/, '').toLowerCase().trim();
        let formattedToken = (this.currentOauthToken || '').trim();
        if (formattedToken && !formattedToken.startsWith('oauth:')) {
            formattedToken = `oauth:${formattedToken}`;
        }
        const clientOptions = {
            options: { debug: false },
            channels: [cleanChannel],
        };
        if (formattedToken && formattedToken.length > 6) {
            clientOptions.identity = {
                username: botNick,
                password: formattedToken,
            };
            this.logger.log(`🔐 Conectando a Twitch en MODO AUTENTICADO como @${botNick} en #${cleanChannel}...`);
        }
        else {
            this.isAuthenticated = false;
            this.authError = 'No se ha configurado Token OAuth';
            this.logger.warn(`👁️ Conectando a Twitch en MODO SÓLO LECTURA anónimo en #${cleanChannel} (Sin Token OAuth). La ruleta visual funcionará pero no podrá enviar comandos de puntos.`);
        }
        try {
            this.client = new tmi.Client(clientOptions);
            this.client.on('message', (channel, tags, message, self) => {
                this.handleChatMessage(channel, tags, message);
            });
            this.client.on('connected', (addr, port) => {
                this.logger.log(`✅ [Twitch IRC Conectado] en ${addr}:${port} | Canal: #${cleanChannel}`);
                if (clientOptions.identity) {
                    this.isAuthenticated = true;
                    this.authError = null;
                }
                this.casinoGateway.emitTwitchStatus(this.getStatus());
            });
            this.client.on('disconnected', (reason) => {
                this.logger.warn(`🔌 [Twitch IRC Desconectado]: ${reason}`);
                this.isAuthenticated = false;
                this.casinoGateway.emitTwitchStatus(this.getStatus());
            });
            await this.client.connect();
        }
        catch (error) {
            this.logger.error(`❌ Error al conectar con Twitch: ${error.message || error}`);
            this.isAuthenticated = false;
            this.authError = error.message || 'Token inválido o expirado. Genera uno nuevo en twitchapps.com/tmi';
            this.casinoGateway.emitTwitchStatus(this.getStatus());
            try {
                this.client = new tmi.Client({ channels: [cleanChannel] });
                this.client.on('message', (ch, tags, msg) => this.handleChatMessage(ch, tags, msg));
                await this.client.connect();
                this.logger.log(`👁️ Conectado en MODO SÓLO LECTURA anónimo en #${cleanChannel}`);
            }
            catch { }
        }
    }
    async handleChatMessage(channel, tags, message) {
        const trimmedMsg = message.trim();
        const sender = tags['display-name'] || tags.username || 'Viewer';
        if (trimmedMsg.startsWith('!points add') ||
            trimmedMsg.startsWith('!p @') ||
            trimmedMsg.startsWith('⏳') ||
            trimmedMsg.startsWith('🚨')) {
            return;
        }
        if (trimmedMsg.toLowerCase().includes('the item is on cooldown') ||
            trimmedMsg.toLowerCase().includes('is on cooldown')) {
            this.logger.warn(`⛔ [Cooldown Detectado] BotRix rechazó la tirada: ${trimmedMsg}.`);
            this.isSpinActive = false;
            return;
        }
        if (trimmedMsg.toLowerCase() === '!resetcooldown' ||
            trimmedMsg.toLowerCase() === '!ruletareset') {
            this.resetCooldown();
            return;
        }
        const canjeRegex1 = /(?:canjear|canjeado|canjeo|canjeó)\s+(?:la\s+)?ruleta.*?@?([a-zA-Z0-9_]+)/i;
        const canjeRegex2 = /@?([a-zA-Z0-9_]+).*?(?:canjear|canjeado|canjeo|canjeó)\s+(?:la\s+)?ruleta/i;
        const botrixPrizeRegex = /@?([a-zA-Z0-9_]+)\s+(\d+)\s+pts\.\s+GANADOS\s+EN\s+LA\s+RULETAAAA/i;
        let targetUser = null;
        let explicitPrize = null;
        const botrixPrizeMatch = trimmedMsg.match(botrixPrizeRegex);
        if (botrixPrizeMatch) {
            targetUser = botrixPrizeMatch[1];
            explicitPrize = parseInt(botrixPrizeMatch[2], 10);
        }
        else {
            const canjeMatch1 = trimmedMsg.match(canjeRegex1);
            const canjeMatch2 = trimmedMsg.match(canjeRegex2);
            if (canjeMatch1) {
                targetUser = canjeMatch1[1];
            }
            else if (canjeMatch2) {
                targetUser = canjeMatch2[1];
            }
        }
        if (targetUser) {
            const cleanUser = targetUser.replace(/^@/, '');
            const lastUserSpin = this.recentSpinUsers.get(cleanUser.toLowerCase()) || 0;
            if (Date.now() - lastUserSpin < 4000) {
                return;
            }
            this.logger.log(`🎯 [Canje de BotRix Detectado para @${cleanUser}]: "${trimmedMsg}"`);
            const prize = explicitPrize !== null ? explicitPrize : this.selectWeightedJackpotPrize();
            await this.executeSpinFlow(channel, cleanUser, prize);
            return;
        }
        const spinMatch = trimmedMsg.match(/^!(?:spin|ruleta)(?:\s+@?([a-zA-Z0-9_]+))?/i);
        if (spinMatch) {
            const cleanUser = (spinMatch[1] || sender).replace(/^@/, '');
            const lastUserSpin = this.recentSpinUsers.get(cleanUser.toLowerCase()) || 0;
            if (Date.now() - lastUserSpin < 4000) {
                return;
            }
            this.logger.log(`🎰 [Comando !spin Detectado] @${cleanUser} activó la ruleta`);
            const weightedPrize = this.selectWeightedJackpotPrize();
            await this.executeSpinFlow(channel, cleanUser, weightedPrize);
            return;
        }
    }
    async executeSpinFlow(channel, username, prize) {
        const now = Date.now();
        const timeSinceLastSpin = now - this.lastSpinTimestamp;
        if (this.lastSpinTimestamp > 0 && timeSinceLastSpin < this.cooldownMs) {
            const remainingSeconds = Math.ceil((this.cooldownMs - timeSinceLastSpin) / 1000);
            const remainingMinutes = Math.floor(remainingSeconds / 60);
            const remainingSecs = remainingSeconds % 60;
            this.logger.warn(`⛔ Ruleta pausada para @${username}: Cooldown activo (${remainingMinutes}m ${remainingSecs}s restantes).`);
            return;
        }
        const lowerUser = username.toLowerCase().replace(/^@/, '');
        if (this.lastConsecutiveUser === lowerUser && this.consecutiveSpinsCount >= this.MAX_CONSECUTIVE_SPINS) {
            this.logger.warn(`⛔ [ANTI-CAMPEO] Tirada bloqueada para @${username}: Ya alcanzó el límite de ${this.MAX_CONSECUTIVE_SPINS} tiradas consecutivas.`);
            if (this.client && this.isAuthenticated) {
                const cleanChan = channel.replace(/^#/, '');
                await this.client.say(cleanChan, `⛔ @${username} ¡Ya tiraste ${this.MAX_CONSECUTIVE_SPINS} veces seguidas! 🐀 Deja que otro espectador juegue para desbloquear tu turno.`);
            }
            return;
        }
        if (this.isSpinActive) {
            this.logger.warn(`⛔ Ruleta pausada para @${username}: Ya hay una tirada en curso.`);
            return;
        }
        if (this.lastConsecutiveUser === lowerUser) {
            this.consecutiveSpinsCount++;
        }
        else {
            this.lastConsecutiveUser = lowerUser;
            this.consecutiveSpinsCount = 1;
        }
        this.logger.log(`🛡️ [ANTI-CAMPEO] Usuario en turno: @${username} (Tirada ${this.consecutiveSpinsCount}/${this.MAX_CONSECUTIVE_SPINS})`);
        this.isSpinActive = true;
        this.lastSpinTimestamp = now;
        this.recentSpinUsers.set(username.toLowerCase(), now);
        try {
            this.logger.log(`🚀 [SECUENCIA CASINO INICIADA] Usuario: @${username} | Premio: ${prize.toLocaleString()} pts`);
            this.casinoGateway.emitStartSpin({
                username,
                prize,
                duration: 15000,
                prizesList: this.ALL_PRIZES_POOL,
            });
            this.logger.log('⏳ Animación en OBS en progreso... Entrega de puntos en 15.5s.');
            await this.sleep(this.SPIN_DURATION_MS);
            const cleanUser = username.replace(/^@/, '');
            let payCommand = this.pointsCommandPattern
                .replace(/{user}/g, cleanUser)
                .replace(/{prize}/g, prize.toString());
            if (!this.pointsCommandPattern.includes('{user}')) {
                payCommand = `!points add ${cleanUser} ${prize}`;
            }
            if (this.client && this.isAuthenticated) {
                await this.client.say(channel, payCommand);
                this.logger.log(`💰 [PAGO ENTREGADO A @${cleanUser}] Comando enviado al chat: ${payCommand}`);
            }
            else {
                this.logger.warn(`⚠️ [TIRADA FINALIZADA (+${prize.toLocaleString()} pts para @${cleanUser})] -> Falta Token OAuth para enviar '${payCommand}' automáticamente. Configúralo en http://localhost:3000`);
            }
        }
        catch (error) {
            this.logger.error(`❌ Error en tirada para @${username}:`, error);
        }
        finally {
            this.isSpinActive = false;
            if (this.announceCountdownInChat) {
                this.scheduleCooldownAnnouncements(channel);
            }
        }
    }
    clearCooldownTimers() {
        for (const t of this.cooldownTimers) {
            clearTimeout(t);
        }
        this.cooldownTimers = [];
    }
    async sendChatMessage(channel, message) {
        if (!this.client || !this.isAuthenticated) {
            this.logger.warn(`⚠️ [AVISO EN CHAT NO ENVIADO] Falta autenticación de Twitch: ${message}`);
            return false;
        }
        try {
            const cleanChannel = channel.replace(/^#/, '');
            await this.client.say(cleanChannel, message);
            this.logger.log(`📢 [CHAT #${cleanChannel}] @${this.currentBotUsername}: ${message}`);
            return true;
        }
        catch (e) {
            this.logger.error(`❌ Error al enviar mensaje al chat #${channel}:`, e);
            return false;
        }
    }
    scheduleCooldownAnnouncements(channel) {
        this.clearCooldownTimers();
        if (!channel || !this.announceCountdownInChat)
            return;
        const cooldownEndsAt = this.lastSpinTimestamp + this.cooldownMs;
        const msRemaining = cooldownEndsAt - Date.now();
        if (msRemaining <= 0) {
            this.sendChatMessage(channel, '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !spin para girar 🎰✨').catch(() => { });
            return;
        }
        this.logger.log(`📢 Programando cuenta regresiva en el chat para el cooldown (${Math.round(msRemaining / 1000)}s restantes)...`);
        if (msRemaining > 3000) {
            const t3 = setTimeout(() => {
                this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 3...');
            }, msRemaining - 3000);
            this.cooldownTimers.push(t3);
        }
        if (msRemaining > 2000) {
            const t2 = setTimeout(() => {
                this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 2...');
            }, msRemaining - 2000);
            this.cooldownTimers.push(t2);
        }
        if (msRemaining > 1000) {
            const t1 = setTimeout(() => {
                this.sendChatMessage(channel, '⏳ ¡La ruleta estará disponible en 1...');
            }, msRemaining - 1000);
            this.cooldownTimers.push(t1);
        }
        const t0 = setTimeout(() => {
            this.sendChatMessage(channel, '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !spin para girar 🎰✨');
            this.logger.log('🎉 [AVISO ENVIADO] ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!');
            this.casinoGateway.emitTwitchStatus(this.getStatus());
        }, msRemaining);
        this.cooldownTimers.push(t0);
    }
    async triggerTestCountdown() {
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
            this.sendChatMessage(channel, '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !spin para girar 🎰✨');
        }, 3000);
        return {
            success: true,
            message: 'Cuenta regresiva iniciada en tu chat de Twitch (3, 2, 1... ¡¡¡¡¡RULETA YA DISPONIBLE!!!!!)',
        };
    }
    resetCooldown() {
        this.clearCooldownTimers();
        this.lastSpinTimestamp = 0;
        this.isSpinActive = false;
        this.logger.log('🔄 Cooldown de tiradas reiniciado manualmente.');
        if (this.announceCountdownInChat && this.currentChannel && this.client && this.isAuthenticated) {
            this.sendChatMessage(this.currentChannel, '🚨 ¡¡¡¡¡RULETA YA DISPONIBLE!!!!! Escribe !spin para girar 🎰✨').catch(() => { });
        }
    }
    setTheme(theme) {
        if (theme) {
            this.currentTheme = theme;
            this.saveConfigToDisk({
                channel: this.currentChannel,
                botUsername: this.currentBotUsername,
                oauthToken: this.currentOauthToken,
                pointsCommand: this.pointsCommandPattern,
                cooldownSeconds: Math.round(this.cooldownMs / 1000),
                theme: this.currentTheme,
                announceCountdown: this.announceCountdownInChat,
            });
            return { success: true, theme: this.currentTheme };
        }
        return { success: false, theme: this.currentTheme };
    }
    setCountdownAnnouncement(enabled) {
        this.announceCountdownInChat = enabled;
        this.saveConfigToDisk({
            channel: this.currentChannel,
            botUsername: this.currentBotUsername,
            oauthToken: this.currentOauthToken,
            pointsCommand: this.pointsCommandPattern,
            cooldownSeconds: Math.round(this.cooldownMs / 1000),
            theme: this.currentTheme,
            announceCountdown: this.announceCountdownInChat,
        });
        return { success: true, enabled: this.announceCountdownInChat };
    }
    setCooldownSeconds(seconds) {
        if (!isNaN(seconds) && seconds >= 0) {
            this.cooldownMs = seconds * 1000;
            this.logger.log(`⏱️ Cooldown modificado a ${seconds} segundos (${Math.round(seconds / 60)} min).`);
            this.saveConfigToDisk({
                channel: this.currentChannel,
                botUsername: this.currentBotUsername,
                oauthToken: this.currentOauthToken,
                pointsCommand: this.pointsCommandPattern,
                cooldownSeconds: seconds,
                theme: this.currentTheme,
                announceCountdown: this.announceCountdownInChat,
            });
            if (this.announceCountdownInChat && this.currentChannel) {
                this.scheduleCooldownAnnouncements(this.currentChannel);
            }
            return {
                success: true,
                message: `Cooldown actualizado a ${seconds} segundos (${Math.round(seconds / 60)} min)`,
            };
        }
        return { success: false, message: 'Valor de cooldown inválido' };
    }
    async reconfigure(config) {
        this.currentChannel = (config.channel || '').trim().replace(/^#/, '');
        this.currentBotUsername = ((config.botUsername || this.currentChannel) || '').trim().replace(/^@/, '');
        this.currentOauthToken = (config.oauthToken || '').trim();
        if (config.pointsCommand && config.pointsCommand.trim() !== '') {
            this.pointsCommandPattern = config.pointsCommand.trim();
        }
        if (config.cooldownSeconds && !isNaN(Number(config.cooldownSeconds))) {
            this.cooldownMs = Number(config.cooldownSeconds) * 1000;
        }
        if (config.theme) {
            this.currentTheme = config.theme;
        }
        if (config.announceCountdown !== undefined) {
            this.announceCountdownInChat = config.announceCountdown === true;
        }
        this.saveConfigToDisk({
            channel: this.currentChannel,
            botUsername: this.currentBotUsername,
            oauthToken: this.currentOauthToken,
            pointsCommand: this.pointsCommandPattern,
            cooldownSeconds: Math.round(this.cooldownMs / 1000),
            theme: this.currentTheme,
            announceCountdown: this.announceCountdownInChat,
        });
        if (this.currentChannel) {
            await this.connectToTwitch();
            return {
                success: true,
                message: `Conectado exitosamente como @${this.currentBotUsername || this.currentChannel} en #${this.currentChannel}`,
            };
        }
        else {
            await this.disconnectFromTwitch();
            return {
                success: true,
                message: 'Configuración guardada (sin canal activo).',
            };
        }
    }
    resetConsecutiveSpins() {
        this.lastConsecutiveUser = null;
        this.consecutiveSpinsCount = 0;
        this.logger.log('🔄 [ANTI-CAMPEO] Racha de tiradas consecutivas reseteada manualmente.');
    }
    getStatus() {
        return {
            channel: this.currentChannel,
            botUsername: this.currentBotUsername,
            oauthToken: this.currentOauthToken,
            isAuthenticated: this.isAuthenticated,
            authError: this.authError,
            isSpinActive: this.isSpinActive,
            cooldownSeconds: Math.round(this.cooldownMs / 1000),
            pointsCommand: this.pointsCommandPattern,
            theme: this.currentTheme,
            announceCountdown: this.announceCountdownInChat,
            isConfigured: Boolean(this.currentChannel && this.currentChannel.trim() !== ''),
            lastConsecutiveUser: this.lastConsecutiveUser,
            consecutiveSpinsCount: this.consecutiveSpinsCount,
            maxConsecutiveSpins: this.MAX_CONSECUTIVE_SPINS,
        };
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    selectWeightedJackpotPrize() {
        const totalWeight = this.PRIZE_TIERS.reduce((sum, tier) => sum + tier.weight, 0);
        let randomNum = Math.random() * totalWeight;
        for (const tier of this.PRIZE_TIERS) {
            if (randomNum < tier.weight) {
                const randomIndex = Math.floor(Math.random() * tier.prizes.length);
                return tier.prizes[randomIndex];
            }
            randomNum -= tier.weight;
        }
        return 10;
    }
};
exports.TwitchService = TwitchService;
exports.TwitchService = TwitchService = TwitchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => casino_gateway_1.CasinoGateway))),
    __metadata("design:paramtypes", [casino_gateway_1.CasinoGateway])
], TwitchService);
//# sourceMappingURL=twitch.service.js.map