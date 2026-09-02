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
        this.deletedGameIds = new Set();
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
    getCandidateFilePaths(fileName) {
        return [
            path.resolve(process.cwd(), fileName),
            path.resolve(process.cwd(), 'backend', fileName),
            path.resolve(__dirname, '..', '..', fileName),
            path.resolve(__dirname, '..', fileName),
        ];
    }
    loadConfig() {
        let loaded = false;
        for (const p of this.getCandidateFilePaths('game_picker_config.json')) {
            if (fs.existsSync(p)) {
                try {
                    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                    if (Array.isArray(data.customGames))
                        this.customGames = data.customGames;
                    if (Array.isArray(data.deletedGameIds))
                        this.deletedGameIds = new Set(data.deletedGameIds);
                    if (Array.isArray(data.enabledGameIds))
                        this.enabledGameIds = new Set(data.enabledGameIds);
                    if (Array.isArray(data.previouslyWonGames))
                        this.previouslyWonGames = new Set(data.previouslyWonGames);
                    if (data.activeTheme)
                        this.activeTheme = data.activeTheme;
                    this.logger.log(`📂 [Config Cargada de Selectora]: ${p} (${this.enabledGameIds.size} habilitados, ${this.customGames.length} custom, ${this.deletedGameIds.size} eliminados).`);
                    loaded = true;
                    break;
                }
                catch (err) {
                    this.logger.error(`Error al leer ${p}`, err);
                }
            }
        }
        if (!loaded || this.enabledGameIds.size === 0) {
            const defaultIds = ['minecraft', 'roblox', 'fortnite', 'lethal-company', 'phasmophobia', 'valorant', 'gta-v', 'fall-guys'];
            defaultIds.forEach((id) => this.enabledGameIds.add(id));
            this.saveConfig();
        }
    }
    saveConfig() {
        const data = {
            customGames: this.customGames,
            deletedGameIds: Array.from(this.deletedGameIds),
            enabledGameIds: Array.from(this.enabledGameIds),
            previouslyWonGames: Array.from(this.previouslyWonGames),
            activeTheme: this.activeTheme,
        };
        const jsonString = JSON.stringify(data, null, 2);
        for (const p of this.getCandidateFilePaths('game_picker_config.json')) {
            try {
                fs.writeFileSync(p, jsonString, 'utf8');
            }
            catch { }
        }
    }
    getAllCatalogGames() {
        return [...this.customGames, ...games_database_1.GAMES_CATALOG].filter((g) => !this.deletedGameIds.has(g.id));
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
    deleteGame(id) {
        this.customGames = this.customGames.filter((g) => g.id !== id);
        this.deletedGameIds.add(id);
        this.enabledGameIds.delete(id);
        this.saveConfig();
        this.broadcastCurrentState();
        return true;
    }
    resetPreviouslyWonGames() {
        this.previouslyWonGames.clear();
        this.saveConfig();
        this.broadcastCurrentState();
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
        this.broadcastCurrentState();
        this.votingTimer = setInterval(() => {
            this.timeRemaining--;
            if (this.onSendMessageToChat) {
                if (this.timeRemaining === 10) {
                    this.onSendMessageToChat('⏳ ¡Las votaciones de la selectora se cierran en 10 segundos!');
                }
                else if (this.timeRemaining === 5) {
                    this.onSendMessageToChat('⏳ ¡Votaciones de la selectora se cierran en 5...');
                }
                else if (this.timeRemaining === 4) {
                    this.onSendMessageToChat('⏳ 4...');
                }
                else if (this.timeRemaining === 3) {
                    this.onSendMessageToChat('⏳ 3...');
                }
                else if (this.timeRemaining === 2) {
                    this.onSendMessageToChat('⏳ 2...');
                }
                else if (this.timeRemaining === 1) {
                    this.onSendMessageToChat('⏳ 1...');
                }
            }
            if (this.timeRemaining <= 0) {
                this.clearVotingTimer();
                if (this.onSendMessageToChat) {
                    this.onSendMessageToChat('🛑 ¡VOTACIONES CERRADAS! Girando la selectora de juegos...');
                }
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
    generateTapeSequence(pool) {
        const uniqueCount = pool.length;
        const totalSlots = 500 + uniqueCount;
        const winnerIndex = totalSlots - 15;
        const tape = new Array(totalSlots);
        const availableIndices = Array.from({ length: totalSlots }, (_, i) => i);
        for (let i = availableIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
        }
        const guaranteedSlots = availableIndices.slice(0, uniqueCount);
        const remainingSlots = availableIndices.slice(uniqueCount);
        for (let i = 0; i < uniqueCount; i++) {
            tape[guaranteedSlots[i]] = pool[i];
        }
        for (const slotIndex of remainingSlots) {
            tape[slotIndex] = this.pickWeightedWinner(pool);
        }
        const winner = tape[winnerIndex];
        return { tape, winnerIndex, winner };
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
        const { tape, winnerIndex, winner } = this.generateTapeSequence(poolToSpin);
        this.winningGame = {
            id: winner.id,
            name: winner.name,
            category: winner.category,
            votedBy: winner.voters,
        };
        this.logger.log(`Giro de Selectora iniciado (${tape.length} casillas totales: 500 base + ${poolToSpin.length} juegos únicos). Ganador en casilla ${winnerIndex}: ${this.winningGame.name}`);
        if (this.onBroadcastSpinStarted) {
            this.onBroadcastSpinStarted({
                durationMs: 60000,
                votedPool: poolToSpin,
                tapeItems: tape.map((item, idx) => ({
                    uniqueKey: `${item.id}-${idx}`,
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    voters: item.voters,
                    votesCount: item.votesCount,
                })),
                winnerIndex,
                winner: this.winningGame,
            });
        }
        this.broadcastCurrentState();
        this.lifecycleTimer = setTimeout(() => {
            this.announceWinnerSequence();
        }, 60000);
    }
    announceWinnerSequence() {
        this.votingState = 'WINNER';
        if (this.winningGame) {
            this.previouslyWonGames.add(this.winningGame.name);
            this.saveConfig();
        }
        this.broadcastCurrentState();
        this.lifecycleTimer = setTimeout(() => {
            this.shutdownSequence();
        }, 30000);
    }
    shutdownSequence() {
        this.logger.log('Selectora de Juegos: Limpiando cinta y apagando totalmente.');
        this.votingState = 'IDLE';
        this.activeVotes.clear();
        this.winningGame = null;
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
        if (normInput.startsWith('web') || normInput.startsWith('juegoweb') || normInput.startsWith('minijuego') || normInput.startsWith('navegador') || normInput.startsWith('io')) {
            let webName = cleanInput.replace(/^(web|juego\s*web|minijuego|navegador|io)\s*[:\-]?\s*/i, '').trim();
            if (webName.length > 0) {
                if (this.isSubmodeAlreadyWon('web', webName)) {
                    this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El juego web "${webName}" ya ganó hoy.`);
                    return { success: false, message: 'Juego web ya ganado hoy' };
                }
                this.activeVotes.set(lowerUser, {
                    username: lowerUser,
                    gameId: `web-${this.normalizeText(webName)}`,
                    gameName: `🌐 Web: ${webName}`,
                    rawInput: cleanInput,
                    timestamp: Date.now(),
                });
                this.broadcastCurrentState();
                return { success: true };
            }
        }
        const enabledCatalog = this.getAllCatalogGames().filter((g) => this.enabledGameIds.has(g.id));
        for (const game of enabledCatalog) {
            if (this.isMultiplatformGame(game)) {
                const gameNorm = this.normalizeText(game.name);
                const gameIdNorm = this.normalizeText(game.id);
                if (normInput === gameNorm || normInput === gameIdNorm || normInput.startsWith(gameNorm) || normInput.startsWith(gameIdNorm)) {
                    const prefixLen = normInput.startsWith(gameNorm) ? game.name.length : game.id.length;
                    let subMode = cleanInput.slice(prefixLen).replace(/^[\s:\-]+/, '').trim();
                    if (subMode.length > 0) {
                        if (this.isSubmodeAlreadyWon(game.id, subMode)) {
                            this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El modo "${subMode}" de ${game.name} ya ganó hoy.`);
                            return { success: false, message: 'Modo ya ganado hoy' };
                        }
                        this.activeVotes.set(lowerUser, {
                            username: lowerUser,
                            gameId: `${game.id}-${this.normalizeText(subMode)}`,
                            gameName: `${game.name}: ${subMode}`,
                            rawInput: cleanInput,
                            timestamp: Date.now(),
                        });
                        this.broadcastCurrentState();
                        return { success: true };
                    }
                    else {
                        if (this.isSubmodeAlreadyWon(game.id, '')) {
                            this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El juego base ${game.name} ya ganó hoy.`);
                            return { success: false, message: 'Juego base ya ganado hoy' };
                        }
                        this.activeVotes.set(lowerUser, {
                            username: lowerUser,
                            gameId: game.id,
                            gameName: game.name,
                            rawInput: cleanInput,
                            timestamp: Date.now(),
                        });
                        this.broadcastCurrentState();
                        return { success: true };
                    }
                }
            }
        }
        if (this.isGameAlreadyWon(cleanInput)) {
            this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El juego "${cleanInput}" ya ganó hoy.`);
            return { success: false, message: 'Juego ya ganado hoy' };
        }
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
            const deInput = this.deleetText(cleanInput);
            for (const game of enabledCatalog) {
                const gameNorm = this.normalizeText(game.name);
                const gameDeleet = this.deleetText(game.name);
                const simNorm = this.calculateSimilarity(gameNorm, normInput);
                const simDeleet = this.calculateSimilarity(gameDeleet, deInput);
                const sim = Math.max(simNorm, simDeleet);
                if (sim > highestSimilarity && sim >= 0.70) {
                    highestSimilarity = sim;
                    matchedGame = game;
                }
            }
        }
        if (matchedGame) {
            if (this.isGameAlreadyWon(matchedGame.name)) {
                this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El juego "${matchedGame.name}" ya ganó hoy.`);
                return { success: false, message: 'Juego ya ganado hoy' };
            }
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
        return { success: false };
    }
    isMultiplatformGame(game) {
        const normId = this.normalizeText(game.id);
        const normName = this.normalizeText(game.name);
        const normCat = this.normalizeText(game.category || '');
        const normPlat = this.normalizeText(game.platform || '');
        return (normId === 'roblox' ||
            normId === 'fortnite' ||
            normName === 'roblox' ||
            normName === 'fortnite' ||
            normName === 'minecraft' ||
            normCat.includes('multiplataforma') ||
            normCat.includes('multijuego') ||
            normCat.includes('sandbox') ||
            normCat.includes('navegador') ||
            normCat.includes('web') ||
            normPlat.includes('multiplataforma') ||
            normPlat.includes('directo'));
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
    deleetText(text) {
        if (!text)
            return '';
        let t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const leetMap = {
            '0': 'o',
            '1': 'i',
            '!': 'i',
            '|': 'i',
            '2': 'z',
            '3': 'e',
            '4': 'a',
            '@': 'a',
            '5': 's',
            '$': 's',
            '6': 'g',
            '7': 't',
            '+': 't',
            '8': 'b',
            '9': 'g',
            '_': ' ',
            '-': ' ',
            '.': ' ',
            '/': ' ',
        };
        let result = '';
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            result += leetMap[ch] !== undefined ? leetMap[ch] : ch;
        }
        result = result
            .replace(/ph/g, 'f')
            .replace(/c(?=[eiy])/g, 's')
            .replace(/[ckq]/g, 'k')
            .replace(/z/g, 's')
            .replace(/v/g, 'b')
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        result = result.replace(/(.)\1+/g, '$1');
        return result;
    }
    isSubmodeAlreadyWon(gameIdOrPlatform, submodeInput) {
        const cleanSub = submodeInput.trim();
        const normPrefix = this.normalizeText(gameIdOrPlatform);
        if (!cleanSub) {
            return Array.from(this.previouslyWonGames).some((won) => {
                const normWon = this.normalizeText(won);
                return normWon === normPrefix || normWon === `${normPrefix} general`;
            });
        }
        const normSub = this.normalizeText(cleanSub);
        const deleetSub = this.deleetText(cleanSub);
        for (const wonEntry of this.previouslyWonGames) {
            let wonSub = '';
            if (wonEntry.includes(':')) {
                const parts = wonEntry.split(':');
                const wonGamePrefix = this.normalizeText(parts[0]);
                if (wonGamePrefix === normPrefix ||
                    normPrefix.includes(wonGamePrefix) ||
                    wonGamePrefix.includes(normPrefix)) {
                    wonSub = parts.slice(1).join(':').trim();
                }
                else {
                    continue;
                }
            }
            else {
                continue;
            }
            if (!wonSub)
                continue;
            const normWonSub = this.normalizeText(wonSub);
            const deleetWonSub = this.deleetText(wonSub);
            if (normSub === normWonSub || (normSub.length >= 4 && normWonSub.length >= 4 && (normSub.includes(normWonSub) || normWonSub.includes(normSub)))) {
                return true;
            }
            if (deleetSub === deleetWonSub || (deleetSub.length >= 4 && deleetWonSub.length >= 4 && (deleetWonSub.includes(deleetSub) || deleetSub.includes(deleetWonSub)))) {
                return true;
            }
            if (this.calculateSimilarity(deleetWonSub, deleetSub) >= 0.72) {
                return true;
            }
            if (this.calculateSimilarity(normWonSub, normSub) >= 0.75) {
                return true;
            }
        }
        return false;
    }
    isGameAlreadyWon(gameName) {
        const normCand = this.normalizeText(gameName);
        if (normCand.startsWith('roblox') ||
            normCand.startsWith('fortnite') ||
            normCand.startsWith('fornite') ||
            normCand.startsWith('roblx') ||
            normCand.startsWith('web')) {
            return false;
        }
        const deleetCand = this.deleetText(gameName);
        for (const wonEntry of this.previouslyWonGames) {
            const normWon = this.normalizeText(wonEntry);
            if (normWon.startsWith('roblox') ||
                normWon.startsWith('fortnite') ||
                normWon.startsWith('fornite') ||
                normWon.startsWith('roblx') ||
                normWon.startsWith('web')) {
                continue;
            }
            const deleetWon = this.deleetText(wonEntry);
            if (normCand === normWon || (normCand.length >= 4 && normWon.length >= 4 && (normCand.includes(normWon) || normWon.includes(normCand)))) {
                return true;
            }
            if (deleetCand === deleetWon || (deleetCand.length >= 4 && deleetWon.length >= 4 && (deleetWon.includes(deleetCand) || deleetCand.includes(deleetWon)))) {
                return true;
            }
            if (this.calculateSimilarity(deleetWon, deleetCand) >= 0.72) {
                return true;
            }
            if (this.calculateSimilarity(normWon, normCand) >= 0.75) {
                return true;
            }
        }
        return false;
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