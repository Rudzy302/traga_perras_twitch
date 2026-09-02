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
var GamePickerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GamePickerService = void 0;
const common_1 = require("@nestjs/common");
const fs = require("fs");
const path = require("path");
const games_database_1 = require("./games-database");
let GamePickerService = GamePickerService_1 = class GamePickerService {
    constructor() {
        this.logger = new common_1.Logger(GamePickerService_1.name);
        this.configPath = path.resolve(process.cwd(), 'game_picker_config.json');
        this.customGames = [];
        this.enabledGameIds = new Set([
            'minecraft',
            'roblox',
            'fortnite',
            'valorant',
            'lethal-company',
            'phasmophobia',
            'fall-guys',
            'gta-v',
            'resident-evil-4-remake',
            'chained-together',
        ]);
        this.previouslyWonGames = new Set();
        this.activeVotes = new Map();
        this.votingState = 'IDLE';
        this.duration = 120;
        this.timeRemaining = 0;
        this.winningGame = null;
        this.activeTheme = 'cyber-arcade';
        this.votingTimer = null;
        this.lifecycleTimer = null;
        this.onSendMessageToChat = null;
        this.onBroadcastState = null;
        this.onBroadcastSpinStarted = null;
        this.loadConfig();
    }
    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                if (Array.isArray(data.customGames))
                    this.customGames = data.customGames;
                if (Array.isArray(data.enabledGameIds))
                    this.enabledGameIds = new Set(data.enabledGameIds);
                if (Array.isArray(data.previouslyWonGames))
                    this.previouslyWonGames = new Set(data.previouslyWonGames);
                if (data.activeTheme)
                    this.activeTheme = data.activeTheme;
                this.logger.log(`Configuración de Selectora de Juegos cargada (${this.enabledGameIds.size} juegos habilitados).`);
            }
        }
        catch (err) {
            this.logger.error('Error al cargar game_picker_config.json', err);
        }
        if (this.enabledGameIds.size === 0) {
            const defaultIds = ['minecraft', 'roblox', 'fortnite', 'lethal-company', 'phasmophobia', 'valorant', 'gta-v', 'fall-guys'];
            defaultIds.forEach((id) => this.enabledGameIds.add(id));
            this.saveConfig();
        }
    }
    saveConfig() {
        try {
            const data = {
                customGames: this.customGames,
                enabledGameIds: Array.from(this.enabledGameIds),
                previouslyWonGames: Array.from(this.previouslyWonGames),
                activeTheme: this.activeTheme,
            };
            fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf8');
        }
        catch (err) {
            this.logger.error('Error al guardar game_picker_config.json', err);
        }
    }
    getAllCatalogGames() {
        return [...this.customGames, ...games_database_1.GAMES_CATALOG];
    }
    searchCatalog(query = '', page = 1, pageSize = 10) {
        const all = this.getAllCatalogGames();
        const cleanQuery = this.normalizeText(query);
        let filtered = all;
        if (cleanQuery.length > 0) {
            filtered = all.filter((g) => {
                const normName = this.normalizeText(g.name);
                const normCat = this.normalizeText(g.category);
                const matchKeyword = g.keywords?.some((k) => this.normalizeText(k).includes(cleanQuery));
                return normName.includes(cleanQuery) || normCat.includes(cleanQuery) || matchKeyword;
            });
        }
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(Math.max(1, page), totalPages);
        const startIndex = (safePage - 1) * pageSize;
        const paginatedGames = filtered.slice(startIndex, startIndex + pageSize).map((g) => ({
            ...g,
            isEnabled: this.enabledGameIds.has(g.id),
            hasWonToday: Array.from(this.previouslyWonGames).some((pw) => this.isSimilar(pw, g.name)),
        }));
        return {
            games: paginatedGames,
            total,
            page: safePage,
            pageSize,
            totalPages,
        };
    }
    enableGame(id) {
        const exists = this.getAllCatalogGames().some((g) => g.id === id);
        if (!exists)
            return false;
        this.enabledGameIds.add(id);
        this.saveConfig();
        this.broadcastCurrentState();
        return true;
    }
    disableGame(id) {
        this.enabledGameIds.delete(id);
        this.saveConfig();
        this.broadcastCurrentState();
        return true;
    }
    addCustomGame(name, category = 'Juego Personalizado') {
        const cleanName = name.trim();
        const id = 'custom-' + Date.now();
        const newGame = {
            id,
            name: cleanName,
            category: category.trim() || 'Juego Personalizado',
            platform: 'PC / Directo',
            keywords: [cleanName.toLowerCase()],
        };
        this.customGames.unshift(newGame);
        this.enabledGameIds.add(id);
        this.saveConfig();
        this.broadcastCurrentState();
        return newGame;
    }
    resetPreviouslyWonGames() {
        this.previouslyWonGames.clear();
        this.saveConfig();
        this.broadcastCurrentState();
        if (this.onSendMessageToChat) {
            this.onSendMessageToChat('🔄 El historial de juegos ganadores ha sido reseteado. ¡Todos los títulos vuelven a estar disponibles!');
        }
    }
    setTheme(theme) {
        this.activeTheme = theme;
        this.saveConfig();
        this.broadcastCurrentState();
    }
    startVoting(durationSeconds = 120) {
        if (this.votingState === 'SPINNING')
            return;
        this.clearAllTimers();
        this.activeVotes.clear();
        this.winningGame = null;
        this.duration = Math.max(30, durationSeconds);
        this.timeRemaining = this.duration;
        this.votingState = 'VOTING';
        this.logger.log(`Votación de Selectora iniciada por ${this.duration} segundos.`);
        if (this.onSendMessageToChat) {
            this.onSendMessageToChat('🎮 ¡Votaciones disponibles! Usa el comando !juego y pon el nombre del juego que quieras que sea jugado.');
        }
        this.broadcastCurrentState();
        this.votingTimer = setInterval(() => {
            this.timeRemaining--;
            if (this.timeRemaining <= 0) {
                this.clearVotingTimer();
                this.startSpinSequence();
            }
            else {
                this.broadcastCurrentState();
            }
        }, 1000);
    }
    stopVotingManual() {
        if (this.votingState !== 'VOTING')
            return;
        this.clearVotingTimer();
        this.startSpinSequence();
    }
    startSpinSequence() {
        this.votingState = 'SPINNING';
        const votedSummaries = this.getVotedSummaries();
        let poolToSpin = votedSummaries;
        if (poolToSpin.length === 0) {
            const enabledList = this.getAllCatalogGames().filter((g) => this.enabledGameIds.has(g.id));
            const fallbackList = enabledList.length > 0 ? enabledList : games_database_1.GAMES_CATALOG.slice(0, 5);
            poolToSpin = fallbackList.map((g) => ({
                id: g.id,
                name: g.name,
                category: g.category,
                votesCount: 1,
                voters: ['Ruleta Automática'],
            }));
        }
        const winnerSummary = this.pickWeightedWinner(poolToSpin);
        this.winningGame = {
            id: winnerSummary.id,
            name: winnerSummary.name,
            category: winnerSummary.category,
            votedBy: winnerSummary.voters,
        };
        this.logger.log(`Giro de Selectora iniciado (20 segundos de suspenso). Ganador calculado: ${this.winningGame.name}`);
        if (this.onSendMessageToChat) {
            this.onSendMessageToChat('🛑 ¡Cola de juegos cerrada! Girando la Selectora en pantalla...');
        }
        if (this.onBroadcastSpinStarted) {
            this.onBroadcastSpinStarted({
                durationMs: 20000,
                votedPool: poolToSpin,
                winner: this.winningGame,
            });
        }
        this.broadcastCurrentState();
        this.lifecycleTimer = setTimeout(() => {
            this.announceWinnerSequence();
        }, 20000);
    }
    announceWinnerSequence() {
        this.votingState = 'WINNER';
        if (this.winningGame) {
            this.previouslyWonGames.add(this.winningGame.name);
            this.saveConfig();
            const votersText = this.winningGame.votedBy.length > 0 && this.winningGame.votedBy[0] !== 'Ruleta Automática'
                ? ` (Votado por: ${this.winningGame.votedBy.slice(0, 4).map((v) => '@' + v).join(', ')}${this.winningGame.votedBy.length > 4 ? ` y ${this.winningGame.votedBy.length - 4} más` : ''})`
                : '';
            if (this.onSendMessageToChat) {
                this.onSendMessageToChat(`🎉 ¡LA SELECTORA HA HABLADO! El juego ganador es: 🏆 ${this.winningGame.name} 🏆${votersText}. ¡A jugar!`);
            }
        }
        this.broadcastCurrentState();
        this.lifecycleTimer = setTimeout(() => {
            this.shutdownSequence();
        }, 20000);
    }
    shutdownSequence() {
        this.logger.log('Selectora de Juegos apagada totalmente (modo silencio activo).');
        this.votingState = 'IDLE';
        this.activeVotes.clear();
        this.timeRemaining = 0;
        this.broadcastCurrentState();
    }
    clearVotingTimer() {
        if (this.votingTimer) {
            clearInterval(this.votingTimer);
            this.votingTimer = null;
        }
    }
    clearAllTimers() {
        this.clearVotingTimer();
        if (this.lifecycleTimer) {
            clearTimeout(this.lifecycleTimer);
            this.lifecycleTimer = null;
        }
    }
    processVote(username, rawInput) {
        const lowerUser = username.toLowerCase().replace('@', '').trim();
        const cleanInput = rawInput.trim();
        if (this.votingState !== 'VOTING') {
            return { success: false };
        }
        if (cleanInput.length < 2 || this.isGibberish(cleanInput)) {
            this.logger.debug(`Spam sin sentido ignorado de @${lowerUser}: "${cleanInput}"`);
            return { success: false };
        }
        const normInput = this.normalizeText(cleanInput);
        const wonMatch = Array.from(this.previouslyWonGames).find((wonName) => this.isSimilar(wonName, cleanInput));
        if (wonMatch) {
            if (this.onSendMessageToChat) {
                this.onSendMessageToChat(`@${lowerUser} Ese juego ya ganó hoy (${wonMatch}), ¡dale la oportunidad a otros títulos! 🎮🚫`);
            }
            return { success: false, message: 'Juego ya ganado' };
        }
        if (normInput.startsWith('roblox') || normInput.startsWith('fortnite') || normInput.startsWith('fornite') || normInput.startsWith('roblx')) {
            const isRoblox = normInput.includes('robl');
            const baseId = isRoblox ? 'roblox' : 'fortnite';
            const baseName = isRoblox ? 'Roblox' : 'Fortnite';
            if (this.enabledGameIds.has(baseId)) {
                let subMode = cleanInput.replace(/^(roblox|roblx|fortnite|fornite|fortnait)\s*[:\-]?\s*/i, '').trim();
                const displayName = subMode.length > 0 ? `${baseName}: ${subMode}` : baseName;
                this.activeVotes.set(lowerUser, {
                    username: lowerUser,
                    gameId: `${baseId}-${this.normalizeText(subMode || 'general')}`,
                    gameName: displayName,
                    rawInput: cleanInput,
                    timestamp: Date.now(),
                });
                this.broadcastCurrentState();
                return { success: true };
            }
            else {
                if (this.onSendMessageToChat) {
                    this.onSendMessageToChat(`@${lowerUser} Ese juego no está disponible por ahora 🚫`);
                }
                return { success: false };
            }
        }
        const enabledCatalog = this.getAllCatalogGames().filter((g) => this.enabledGameIds.has(g.id));
        let matchedGame = null;
        for (const game of enabledCatalog) {
            const gameNorm = this.normalizeText(game.name);
            if (gameNorm === normInput || normInput.includes(gameNorm) || gameNorm.includes(normInput)) {
                matchedGame = game;
                break;
            }
            if (game.keywords && game.keywords.some((kw) => this.normalizeText(kw) === normInput || normInput.includes(this.normalizeText(kw)))) {
                matchedGame = game;
                break;
            }
        }
        if (!matchedGame) {
            let highestSimilarity = 0;
            for (const game of enabledCatalog) {
                const sim = this.calculateSimilarity(this.normalizeText(game.name), normInput);
                if (sim > highestSimilarity && sim >= 0.70) {
                    highestSimilarity = sim;
                    matchedGame = game;
                }
            }
        }
        if (matchedGame) {
            this.activeVotes.set(lowerUser, {
                username: lowerUser,
                gameId: matchedGame.id,
                gameName: matchedGame.name,
                rawInput: cleanInput,
                timestamp: Date.now(),
            });
            this.broadcastCurrentState();
            return { success: true };
        }
        const fullCatalog = this.getAllCatalogGames();
        const catalogMatch = fullCatalog.find((g) => this.isSimilar(g.name, cleanInput));
        if (catalogMatch) {
            if (this.onSendMessageToChat) {
                this.onSendMessageToChat(`@${lowerUser} Ese juego no está disponible por ahora 🚫`);
            }
            return { success: false, message: 'Juego no habilitado' };
        }
        return { success: false };
    }
    getVotedSummaries() {
        const map = new Map();
        for (const vote of this.activeVotes.values()) {
            const existing = map.get(vote.gameId);
            if (existing) {
                existing.voters.push(vote.username);
            }
            else {
                const catalogGame = this.getAllCatalogGames().find((g) => g.id === vote.gameId);
                map.set(vote.gameId, {
                    id: vote.gameId,
                    name: vote.gameName,
                    category: catalogGame?.category || 'Juego Sugerido',
                    voters: [vote.username],
                });
            }
        }
        return Array.from(map.values()).map((item) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            votesCount: item.voters.length,
            voters: item.voters,
        }));
    }
    pickWeightedWinner(pool) {
        const totalVotes = pool.reduce((sum, item) => sum + item.votesCount, 0);
        let rand = Math.random() * totalVotes;
        for (const item of pool) {
            if (rand < item.votesCount) {
                return item;
            }
            rand -= item.votesCount;
        }
        return pool[pool.length - 1];
    }
    getState() {
        const summaries = this.getVotedSummaries();
        const all = this.getAllCatalogGames();
        const enabledGamesList = all
            .filter((g) => this.enabledGameIds.has(g.id))
            .map((g) => ({
            id: g.id,
            name: g.name,
            category: g.category,
            platform: g.platform,
        }));
        return {
            votingState: this.votingState,
            duration: this.duration,
            timeRemaining: this.timeRemaining,
            totalVotes: this.activeVotes.size,
            votedGames: summaries,
            previouslyWonGames: Array.from(this.previouslyWonGames),
            enabledGameIds: Array.from(this.enabledGameIds),
            enabledGames: enabledGamesList,
            winningGame: this.winningGame,
            activeTheme: this.activeTheme,
        };
    }
    broadcastCurrentState() {
        if (this.onBroadcastState) {
            this.onBroadcastState(this.getState());
        }
    }
    normalizeText(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    isSimilar(target, input) {
        const normTarget = this.normalizeText(target);
        const normInput = this.normalizeText(input);
        if (normTarget === normInput || normTarget.includes(normInput) || normInput.includes(normTarget))
            return true;
        return this.calculateSimilarity(normTarget, normInput) >= 0.72;
    }
    calculateSimilarity(s1, s2) {
        if (s1 === s2)
            return 1.0;
        if (s1.length === 0 || s2.length === 0)
            return 0.0;
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }
    levenshteinDistance(s1, s2) {
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                }
                else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0)
                costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }
    isGibberish(text) {
        if (/^[a-z]{6,}$/i.test(text)) {
            const uniqueChars = new Set(text.toLowerCase()).size;
            if (uniqueChars <= 2)
                return true;
        }
        if (/^(asdf|qwer|zxcv|1234|jklñ|poiu)/i.test(text))
            return true;
        return false;
    }
};
exports.GamePickerService = GamePickerService;
exports.GamePickerService = GamePickerService = GamePickerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GamePickerService);
//# sourceMappingURL=game-picker.service.js.map