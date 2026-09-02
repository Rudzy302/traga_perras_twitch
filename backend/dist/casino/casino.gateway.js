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
var CasinoGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CasinoGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const twitch_service_1 = require("../twitch/twitch.service");
const game_picker_service_1 = require("../games/game-picker.service");
let CasinoGateway = CasinoGateway_1 = class CasinoGateway {
    constructor(twitchService, gamePickerService) {
        this.twitchService = twitchService;
        this.gamePickerService = gamePickerService;
        this.logger = new common_1.Logger(CasinoGateway_1.name);
    }
    afterInit(server) {
        this.logger.log('🎰 Casino Gateway inicializado. Listo para conexiones OBS y panel de control.');
    }
    handleConnection(client) {
        this.logger.log(`🟢 Cliente conectado: ${client.id}`);
        if (this.twitchService) {
            client.emit('twitch-status', this.twitchService.getStatus());
        }
        if (this.gamePickerService) {
            const state = this.gamePickerService.getState();
            client.emit('game-picker-state', state);
            const catalog = this.gamePickerService.searchCatalog('', 1, 10);
            client.emit('game-picker-catalog-result', catalog);
        }
    }
    handleDisconnect(client) {
        this.logger.log(`🔴 Cliente desconectado: ${client.id}`);
    }
    emitStartSpin(payload) {
        this.logger.log(`📢 Emitiendo 'start-spin' para @${payload.username} con premio: ${payload.prize} pts`);
        this.server.emit('start-spin', payload);
    }
    handleGetStatus(client) {
        return this.twitchService.getStatus();
    }
    async handleSetCredentials(payload, client) {
        this.logger.log(`⚙️ Recibida nueva configuración para canal: ${payload?.channel}`);
        const result = await this.twitchService.reconfigure(payload);
        this.server.emit('twitch-status', this.twitchService.getStatus());
        return result;
    }
    handleTestSpin(payload, client) {
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
    handleResetCooldown(client) {
        if (this.twitchService) {
            this.twitchService.resetCooldown();
            this.server.emit('twitch-status', this.twitchService.getStatus());
        }
        return { success: true, message: 'Cooldown reiniciado con éxito' };
    }
    emitTwitchStatus(status) {
        if (this.server) {
            this.server.emit('twitch-status', status);
        }
    }
    async handleTestCountdown(client) {
        if (this.twitchService) {
            return await this.twitchService.triggerTestCountdown();
        }
        return { success: false, message: 'Servicio de Twitch no disponible' };
    }
    handleSetCooldown(payload, client) {
        if (this.twitchService && payload && payload.cooldownSeconds !== undefined) {
            const result = this.twitchService.setCooldownSeconds(Number(payload.cooldownSeconds));
            this.server.emit('twitch-status', this.twitchService.getStatus());
            return result;
        }
        return { success: false, message: 'Valor de cooldown inválido' };
    }
    handleSetTheme(payload, client) {
        if (this.twitchService && payload?.theme) {
            const result = this.twitchService.setTheme(payload.theme);
            this.server.emit('theme-change', payload.theme);
            this.server.emit('twitch-status', this.twitchService.getStatus());
            return result;
        }
        return { success: false };
    }
    handleSetCountdownAnnouncement(payload, client) {
        if (this.twitchService && payload) {
            const result = this.twitchService.setCountdownAnnouncement(Boolean(payload.enabled));
            this.server.emit('twitch-status', this.twitchService.getStatus());
            return result;
        }
        return { success: false };
    }
    handleResetConsecutiveSpins(client) {
        if (this.twitchService) {
            this.twitchService.resetConsecutiveSpins();
            this.server.emit('twitch-status', this.twitchService.getStatus());
            return { success: true, message: 'Racha anti-campeo reseteada exitosamente' };
        }
        return { success: false };
    }
    emitGamePickerState(state) {
        if (this.server) {
            this.server.emit('game-picker-state', state);
        }
    }
    emitGamePickerSpinStarted(payload) {
        if (this.server) {
            this.server.emit('game-picker-spin-started', payload);
        }
    }
    handleGetGamePickerState(client) {
        const state = this.gamePickerService.getState();
        if (client) {
            client.emit('game-picker-state', state);
        }
        return state;
    }
    handleSearchGameCatalog(payload, client) {
        const q = payload && typeof payload === 'object' ? payload.query || '' : '';
        const p = payload && typeof payload === 'object' ? payload.page || 1 : 1;
        const ps = payload && typeof payload === 'object' ? payload.pageSize || 10 : 10;
        const result = this.gamePickerService.searchCatalog(q, p, ps);
        if (client) {
            client.emit('game-picker-catalog-result', result);
        }
        return result;
    }
    handleStartGamePickerVoting(payload, client) {
        const sec = payload && typeof payload === 'object' && payload.durationSeconds ? Number(payload.durationSeconds) : 120;
        this.gamePickerService.startVoting(sec);
        return { success: true };
    }
    handleStopGamePickerVoting(client) {
        this.gamePickerService.stopVotingManual();
        return { success: true };
    }
    handleEnableGame(payload, client) {
        const id = payload && typeof payload === 'object' ? payload.id : (typeof payload === 'string' ? payload : '');
        const success = this.gamePickerService.enableGame(id);
        const catalog = this.gamePickerService.searchCatalog('', 1, 10);
        this.server.emit('game-picker-catalog-result', catalog);
        return { success };
    }
    handleDisableGame(payload, client) {
        const id = payload && typeof payload === 'object' ? payload.id : (typeof payload === 'string' ? payload : '');
        const success = this.gamePickerService.disableGame(id);
        const catalog = this.gamePickerService.searchCatalog('', 1, 10);
        this.server.emit('game-picker-catalog-result', catalog);
        return { success };
    }
    handleAddCustomGame(payload, client) {
        if (payload && payload.name) {
            const created = this.gamePickerService.addCustomGame(payload.name, payload.category);
            const catalog = this.gamePickerService.searchCatalog('', 1, 10);
            this.server.emit('game-picker-catalog-result', catalog);
            return { success: true, game: created };
        }
        return { success: false, message: 'Nombre de juego requerido' };
    }
    handleResetGameWonHistory(client) {
        this.gamePickerService.resetPreviouslyWonGames();
        const catalog = this.gamePickerService.searchCatalog('', 1, 10);
        this.server.emit('game-picker-catalog-result', catalog);
        return { success: true };
    }
    handleSetGamePickerTheme(payload, client) {
        const theme = payload && typeof payload === 'object' ? payload.theme : (typeof payload === 'string' ? payload : '');
        if (theme) {
            this.gamePickerService.setTheme(theme);
            return { success: true };
        }
        return { success: false };
    }
};
exports.CasinoGateway = CasinoGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], CasinoGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('get-twitch-status'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleGetStatus", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('set-twitch-credentials'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], CasinoGateway.prototype, "handleSetCredentials", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('test-spin'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleTestSpin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('reset-cooldown'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleResetCooldown", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('test-countdown'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], CasinoGateway.prototype, "handleTestCountdown", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('set-cooldown'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleSetCooldown", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('set-theme'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleSetTheme", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('set-countdown-announcement'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleSetCountdownAnnouncement", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('reset-consecutive-spins'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleResetConsecutiveSpins", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('get-game-picker-state'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleGetGamePickerState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('search-game-picker-catalog'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleSearchGameCatalog", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('start-game-picker-voting'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleStartGamePickerVoting", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('stop-game-picker-voting'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleStopGamePickerVoting", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('enable-game'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleEnableGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('disable-game'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleDisableGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('add-custom-game'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleAddCustomGame", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('reset-game-won-history'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleResetGameWonHistory", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('set-game-picker-theme'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", void 0)
], CasinoGateway.prototype, "handleSetGamePickerTheme", null);
exports.CasinoGateway = CasinoGateway = CasinoGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __param(0, (0, common_1.Inject)((0, common_1.forwardRef)(() => twitch_service_1.TwitchService))),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => game_picker_service_1.GamePickerService))),
    __metadata("design:paramtypes", [twitch_service_1.TwitchService,
        game_picker_service_1.GamePickerService])
], CasinoGateway);
//# sourceMappingURL=casino.gateway.js.map