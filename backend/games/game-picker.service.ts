import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { GAMES_CATALOG, GameEntry } from './games-database';

export interface VotedGameSummary {
  id: string;
  name: string;
  category: string;
  votesCount: number;
  voters: string[];
}

export interface GamePickerState {
  votingState: 'IDLE' | 'VOTING' | 'SPINNING' | 'WINNER' | 'COOLDOWN';
  duration: number; // en segundos
  timeRemaining: number;
  totalVotes: number;
  votedGames: VotedGameSummary[];
  previouslyWonGames: string[];
  enabledGameIds: string[];
  enabledGames: { id: string; name: string; category: string; platform?: string }[];
  winningGame: {
    id: string;
    name: string;
    category: string;
    votedBy: string[];
  } | null;
  activeTheme: string;
}

@Injectable()
export class GamePickerService {
  private readonly logger = new Logger(GamePickerService.name);
  private configPath = path.resolve(process.cwd(), 'game_picker_config.json');

  private customGames: GameEntry[] = [];
  private deletedGameIds: Set<string> = new Set();
  private enabledGameIds: Set<string> = new Set([
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

  private previouslyWonGames: Set<string> = new Set();
  private activeVotes: Map<string, { username: string; gameId: string; gameName: string; rawInput: string; timestamp: number }> = new Map();

  private votingState: 'IDLE' | 'VOTING' | 'SPINNING' | 'WINNER' | 'COOLDOWN' = 'IDLE';
  private duration: number = 120; // 2 minutos por defecto
  private timeRemaining: number = 0;
  private winningGame: { id: string; name: string; category: string; votedBy: string[] } | null = null;
  private activeTheme: string = 'cyber-arcade';

  private votingTimer: NodeJS.Timeout | null = null;
  private lifecycleTimer: NodeJS.Timeout | null = null;

  // Callbacks para emitir eventos y mensajes a Twitch
  public onSendMessageToChat: ((msg: string) => void) | null = null;
  public onBroadcastState: ((state: GamePickerState) => void) | null = null;
  public onBroadcastSpinStarted: ((payload: any) => void) | null = null;

  constructor() {
    this.loadConfig();
  }

  private getCandidateFilePaths(fileName: string): string[] {
    return [
      path.resolve(process.cwd(), fileName),
      path.resolve(process.cwd(), 'backend', fileName),
      path.resolve(__dirname, '..', '..', fileName),
      path.resolve(__dirname, '..', fileName),
    ];
  }

  private loadConfig() {
    let loaded = false;
    for (const p of this.getCandidateFilePaths('game_picker_config.json')) {
      if (fs.existsSync(p)) {
        try {
          const data = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (Array.isArray(data.customGames)) this.customGames = data.customGames;
          if (Array.isArray(data.deletedGameIds)) this.deletedGameIds = new Set(data.deletedGameIds);
          if (Array.isArray(data.enabledGameIds)) this.enabledGameIds = new Set(data.enabledGameIds);
          if (Array.isArray(data.previouslyWonGames)) this.previouslyWonGames = new Set(data.previouslyWonGames);
          if (data.activeTheme) this.activeTheme = data.activeTheme;
          this.logger.log(`📂 [Config Cargada de Selectora]: ${p} (${this.enabledGameIds.size} habilitados, ${this.customGames.length} custom, ${this.deletedGameIds.size} eliminados).`);
          loaded = true;
          break;
        } catch (err) {
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

  private saveConfig() {
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
      } catch {}
    }
  }

  // --- CATÁLOGO Y BÚSQUEDA PAGINADA (10 EN 10) ---

  public getAllCatalogGames(): GameEntry[] {
    return [...this.customGames, ...GAMES_CATALOG].filter((g) => !this.deletedGameIds.has(g.id));
  }

  public searchCatalog(query: string = '', page: number = 1, pageSize: number = 10) {
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

  public enableGame(id: string): boolean {
    const exists = this.getAllCatalogGames().some((g) => g.id === id);
    if (!exists) return false;
    this.enabledGameIds.add(id);
    this.saveConfig();
    this.broadcastCurrentState();
    return true;
  }

  public disableGame(id: string): boolean {
    this.enabledGameIds.delete(id);
    this.saveConfig();
    this.broadcastCurrentState();
    return true;
  }

  public addCustomGame(name: string, category: string = 'Juego Personalizado'): GameEntry {
    const cleanName = name.trim();
    const id = 'custom-' + Date.now();
    const newGame: GameEntry = {
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

  public deleteGame(id: string): boolean {
    this.customGames = this.customGames.filter((g) => g.id !== id);
    this.deletedGameIds.add(id);
    this.enabledGameIds.delete(id);
    this.saveConfig();
    this.broadcastCurrentState();
    return true;
  }

  public resetPreviouslyWonGames() {
    this.previouslyWonGames.clear();
    this.saveConfig();
    this.broadcastCurrentState();
  }

  public setTheme(theme: string) {
    this.activeTheme = theme;
    this.saveConfig();
    this.broadcastCurrentState();
  }

  // --- CICLO DE VIDA DE VOTACIÓN AUTOMATIZADO ---

  public startVoting(durationSeconds: number = 120) {
    if (this.votingState === 'SPINNING') return;

    this.clearAllTimers();
    this.activeVotes.clear();
    this.winningGame = null;
    this.duration = Math.max(30, durationSeconds);
    this.timeRemaining = this.duration;
    this.votingState = 'VOTING';

    this.logger.log(`Votación de Selectora iniciada por ${this.duration} segundos.`);
    this.broadcastCurrentState();

    // Cuenta regresiva de la votación
    this.votingTimer = setInterval(() => {
      this.timeRemaining--;

      // Avisos de cuenta regresiva en el chat de Twitch (auto-borrados tras 60s)
      if (this.onSendMessageToChat) {
        if (this.timeRemaining === 10) {
          this.onSendMessageToChat('⏳ ¡Las votaciones de la selectora se cierran en 10 segundos!');
        } else if (this.timeRemaining === 5) {
          this.onSendMessageToChat('⏳ ¡Votaciones de la selectora se cierran en 5...');
        } else if (this.timeRemaining === 4) {
          this.onSendMessageToChat('⏳ 4...');
        } else if (this.timeRemaining === 3) {
          this.onSendMessageToChat('⏳ 3...');
        } else if (this.timeRemaining === 2) {
          this.onSendMessageToChat('⏳ 2...');
        } else if (this.timeRemaining === 1) {
          this.onSendMessageToChat('⏳ 1...');
        }
      }

      if (this.timeRemaining <= 0) {
        this.clearVotingTimer();
        if (this.onSendMessageToChat) {
          this.onSendMessageToChat('🛑 ¡VOTACIONES CERRADAS! Girando la selectora de juegos...');
        }
        this.startSpinSequence();
      } else {
        this.broadcastCurrentState();
      }
    }, 1000);
  }

  public stopVotingManual() {
    if (this.votingState !== 'VOTING') return;
    this.clearVotingTimer();
    this.startSpinSequence();
  }

  private generateTapeSequence(pool: VotedGameSummary[]): {
    tape: VotedGameSummary[];
    winnerIndex: number;
    winner: VotedGameSummary;
  } {
    const uniqueCount = pool.length;
    // Capacidad: 500 casillas base de sobra + Cantidad de Juegos Únicos Postulados
    const totalSlots = 500 + uniqueCount;
    const winnerIndex = totalSlots - 15; // 15 casillas de margen final tras el ganador

    const tape: VotedGameSummary[] = new Array(totalSlots);

    // 1. Garantía Mínima: Asignar 1 casilla asegurada a cada juego postulado único
    const availableIndices = Array.from({ length: totalSlots }, (_, i) => i);
    // Barajar índices aleatoriamente (Fisher-Yates)
    for (let i = availableIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
    }

    const guaranteedSlots = availableIndices.slice(0, uniqueCount);
    const remainingSlots = availableIndices.slice(uniqueCount);

    for (let i = 0; i < uniqueCount; i++) {
      tape[guaranteedSlots[i]] = pool[i];
    }

    // 2. Rellenar las 500 casillas restantes por probabilidad pura proporcional a votos
    for (const slotIndex of remainingSlots) {
      tape[slotIndex] = this.pickWeightedWinner(pool);
    }

    // 3. El ganador legítimo es el juego que quedó en la casilla winnerIndex por puro azar
    const winner = tape[winnerIndex];

    return { tape, winnerIndex, winner };
  }

  private startSpinSequence() {
    this.votingState = 'SPINNING';
    const votedSummaries = this.getVotedSummaries();

    let poolToSpin: VotedGameSummary[] = votedSummaries;
    // Si nadie votó, elegimos del catálogo de habilitados para que gire igual
    if (poolToSpin.length === 0) {
      const enabledList = this.getAllCatalogGames().filter((g) => this.enabledGameIds.has(g.id));
      const fallbackList = enabledList.length > 0 ? enabledList : GAMES_CATALOG.slice(0, 5);
      poolToSpin = fallbackList.map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
        votesCount: 1,
        voters: ['Ruleta Automática'],
      }));
    }

    // Generar la cinta de 500 + N casillas con garantía y probabilidad por votos
    const { tape, winnerIndex, winner } = this.generateTapeSequence(poolToSpin);

    this.winningGame = {
      id: winner.id,
      name: winner.name,
      category: winner.category,
      votedBy: winner.voters,
    };

    this.logger.log(`Giro de Selectora iniciado (${tape.length} casillas totales: 500 base + ${poolToSpin.length} juegos únicos). Ganador en casilla ${winnerIndex}: ${this.winningGame.name}`);

    // Emitir inicio de giro a OBS y Dashboard con la cinta completa
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

    // Fase 3: A los 60 segundos de giro completo, anunciar ganador
    this.lifecycleTimer = setTimeout(() => {
      this.announceWinnerSequence();
    }, 60000);
  }

  private announceWinnerSequence() {
    this.votingState = 'WINNER';
    if (this.winningGame) {
      this.previouslyWonGames.add(this.winningGame.name);
      this.saveConfig();
    }

    this.broadcastCurrentState();

    // Fase 4: Exactamente a los 30 segundos de mostrar el resultado, limpiar cinta y apagar totalmente
    this.lifecycleTimer = setTimeout(() => {
      this.shutdownSequence();
    }, 30000);
  }

  private shutdownSequence() {
    this.logger.log('Selectora de Juegos: Limpiando cinta y apagando totalmente.');
    this.votingState = 'IDLE';
    this.activeVotes.clear();
    this.winningGame = null;
    this.timeRemaining = 0;
    this.broadcastCurrentState();
  }

  private clearVotingTimer() {
    if (this.votingTimer) {
      clearInterval(this.votingTimer);
      this.votingTimer = null;
    }
  }

  private clearAllTimers() {
    this.clearVotingTimer();
    if (this.lifecycleTimer) {
      clearTimeout(this.lifecycleTimer);
      this.lifecycleTimer = null;
    }
  }

  // --- PROCESAMIENTO DE VOTOS DEL CHAT (!juego) ---

  public processVote(username: string, rawInput: string): { success: boolean; message?: string } {
    const lowerUser = username.toLowerCase().replace('@', '').trim();
    const cleanInput = rawInput.trim();

    // 1. REGLA DE SILENCIO: Si la votación NO está abierta, silencio absoluto
    if (this.votingState !== 'VOTING') {
      return { success: false };
    }

    // 2. FILTRO ANTI-SPAM SILENCIOSO: Textos sin sentido o muy cortos
    if (cleanInput.length < 2 || this.isGibberish(cleanInput)) {
      this.logger.debug(`Spam sin sentido ignorado de @${lowerUser}: "${cleanInput}"`);
      return { success: false };
    }

    const normInput = this.normalizeText(cleanInput);

    // 3. DETECCIÓN JUEGOS WEB / NAVEGADOR
    if (normInput.startsWith('web') || normInput.startsWith('juegoweb') || normInput.startsWith('minijuego') || normInput.startsWith('navegador') || normInput.startsWith('io')) {
      let webName = cleanInput.replace(/^(web|juego\s*web|minijuego|navegador|io)\s*[:\-]?\s*/i, '').trim();
      if (webName.length > 0) {
        // Verificar si ese juego web específico ya ganó hoy con anti-bypass (f0rz4k3n / forzaken)
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

    // 4. DETECCIÓN MULTIPLATAFORMA (Roblox & Fortnite)
    if (normInput.startsWith('roblox') || normInput.startsWith('fortnite') || normInput.startsWith('fornite') || normInput.startsWith('roblx')) {
      const isRoblox = normInput.includes('robl');
      const baseId = isRoblox ? 'roblox' : 'fortnite';
      const baseName = isRoblox ? 'Roblox' : 'Fortnite';

      if (this.enabledGameIds.has(baseId)) {
        // Extraer submodo (ej: Forsaken, Box Fight, Brookhaven, Tycoon)
        let subMode = cleanInput.replace(/^(roblox|roblx|fortnite|fornite|fortnait)\s*[:\-]?\s*/i, '').trim();

        // Verificar si este submodo específico ya ganó hoy con anti-bypass (ej: f0rz4k3n vs forzaken)
        if (subMode.length > 0 && this.isSubmodeAlreadyWon(baseId, subMode)) {
          this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El modo "${subMode}" de ${baseName} ya ganó hoy.`);
          return { success: false, message: 'Modo ya ganado hoy' };
        }

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
      } else {
        return { success: false };
      }
    }

    // 5. SISTEMA ANTI-REPETICIÓN PARA JUEGOS ESTÁNDAR / INDIVIDUALES
    if (this.isGameAlreadyWon(cleanInput)) {
      this.logger.log(`🚫 Voto ignorado para @${lowerUser}: El juego "${cleanInput}" ya ganó hoy.`);
      return { success: false, message: 'Juego ya ganado hoy' };
    }

    // 6. BÚSQUEDA CONTRA JUEGOS HABILITADOS (Directa y Fuzzy Matching con Anti-Bypass)
    const enabledCatalog = this.getAllCatalogGames().filter((g) => this.enabledGameIds.has(g.id));
    let matchedGame: GameEntry | null = null;

    // A. Coincidencia exacta o por keywords
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

    // B. Coincidencia por similitud ortográfica y anti-bypass (Fuzzy Matching > 70%)
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
      // Verificar si el juego encontrado ya ganó hoy
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

    // 7. Si no se reconoce en absoluto, ignorar silenciosamente
    return { success: false };
  }

  // --- HELPERS Y MATEMÁTICAS PONDERADAS ---

  private getVotedSummaries(): VotedGameSummary[] {
    const map = new Map<string, { id: string; name: string; category: string; voters: string[] }>();

    for (const vote of this.activeVotes.values()) {
      const existing = map.get(vote.gameId);
      if (existing) {
        existing.voters.push(vote.username);
      } else {
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

  private pickWeightedWinner(pool: VotedGameSummary[]): VotedGameSummary {
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

  public getState(): GamePickerState {
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

  private broadcastCurrentState() {
    if (this.onBroadcastState) {
      this.onBroadcastState(this.getState());
    }
  }

  private deleetText(text: string): string {
    if (!text) return '';
    let t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Reemplazos de leet speak / números / símbolos comunes (ej: f0rz4k3n -> forzaken)
    const leetMap: { [key: string]: string } = {
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

    // Normalizar fonemas similares y signos
    result = result
      .replace(/ph/g, 'f')
      .replace(/c(?=[eiy])/g, 's')
      .replace(/[ckq]/g, 'k')
      .replace(/z/g, 's')
      .replace(/v/g, 'b')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Colapsar letras repetidas por fuerza bruta (ej: ffoooorrssaken -> forsaken)
    result = result.replace(/(.)\1+/g, '$1');

    return result;
  }

  private isSubmodeAlreadyWon(platform: 'roblox' | 'fortnite' | 'web', submodeInput: string): boolean {
    const cleanSub = submodeInput.trim();
    if (!cleanSub) {
      // Si no especificó submodo (!juego roblox), verificar si ya ganó el juego base genérico
      return Array.from(this.previouslyWonGames).some((won) => {
        const normWon = this.normalizeText(won);
        return normWon === platform || normWon === `${platform} general`;
      });
    }

    const normSub = this.normalizeText(cleanSub);
    const deleetSub = this.deleetText(cleanSub);

    for (const wonEntry of this.previouslyWonGames) {
      let wonSub = '';

      if (wonEntry.includes(':')) {
        const parts = wonEntry.split(':');
        const wonPlatform = parts[0].trim().toLowerCase();
        if (
          (platform === 'roblox' && wonPlatform.includes('robl')) ||
          (platform === 'fortnite' && wonPlatform.includes('fortn')) ||
          (platform === 'web' && wonPlatform.includes('web'))
        ) {
          wonSub = parts.slice(1).join(':').trim();
        } else {
          continue; // Ganador fue de otra plataforma distinta
        }
      } else {
        // Si el ganador anterior fue solo el juego base genérico (ej: "Roblox"),
        // NO bloquea los submodos específicos como "balsas oxidadas" o "guerra de confetti".
        continue;
      }

      if (!wonSub) continue;

      const normWonSub = this.normalizeText(wonSub);
      const deleetWonSub = this.deleetText(wonSub);

      // 1. Coincidencia directa normalizada
      if (normSub === normWonSub || (normSub.length >= 4 && normWonSub.length >= 4 && (normSub.includes(normWonSub) || normWonSub.includes(normSub)))) {
        return true;
      }

      // 2. Coincidencia Anti-Bypass / Deleet (ej: f0rz4k3n vs forsaken)
      if (deleetSub === deleetWonSub || (deleetSub.length >= 4 && deleetWonSub.length >= 4 && (deleetWonSub.includes(deleetSub) || deleetSub.includes(deleetWonSub)))) {
        return true;
      }

      // 3. Similitud Levenshtein con texto desleeteado (> 72%)
      if (this.calculateSimilarity(deleetWonSub, deleetSub) >= 0.72) {
        return true;
      }

      // 4. Similitud Levenshtein directa (> 75%)
      if (this.calculateSimilarity(normWonSub, normSub) >= 0.75) {
        return true;
      }
    }

    return false;
  }

  private isGameAlreadyWon(gameName: string): boolean {
    const normCand = this.normalizeText(gameName);

    // Si la entrada es un comando de plataforma (roblox, fortnite, web),
    // la validación de submodos le corresponde exclusivamente a isSubmodeAlreadyWon
    if (
      normCand.startsWith('roblox') ||
      normCand.startsWith('fortnite') ||
      normCand.startsWith('fornite') ||
      normCand.startsWith('roblx') ||
      normCand.startsWith('web')
    ) {
      return false;
    }

    const deleetCand = this.deleetText(gameName);

    for (const wonEntry of this.previouslyWonGames) {
      const normWon = this.normalizeText(wonEntry);

      // Si la entrada ganadora fue de una plataforma, ignorar aquí
      if (
        normWon.startsWith('roblox') ||
        normWon.startsWith('fortnite') ||
        normWon.startsWith('fornite') ||
        normWon.startsWith('roblx') ||
        normWon.startsWith('web')
      ) {
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

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private isSimilar(target: string, input: string): boolean {
    const normTarget = this.normalizeText(target);
    const normInput = this.normalizeText(input);
    if (normTarget === normInput || normTarget.includes(normInput) || normInput.includes(normTarget)) return true;
    return this.calculateSimilarity(normTarget, normInput) >= 0.72;
  }

  private calculateSimilarity(s1: string, s2: string): number {
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0.0;

    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(s1: string, s2: string): number {
    const costs: number[] = [];
    for (let i = 0; i <= s1.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= s2.length; j++) {
        if (i === 0) {
          costs[j] = j;
        } else if (j > 0) {
          let newValue = costs[j - 1];
          if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
          }
          costs[j - 1] = lastValue;
          lastValue = newValue;
        }
      }
      if (i > 0) costs[s2.length] = lastValue;
    }
    return costs[s2.length];
  }

  private isGibberish(text: string): boolean {
    // Detecta si es una seguidilla de teclas sin sentido (ej: asdfghjkl, 12345678, aaaaaaaa)
    if (/^[a-z]{6,}$/i.test(text)) {
      const uniqueChars = new Set(text.toLowerCase()).size;
      if (uniqueChars <= 2) return true; // aaaaaa, asasas
    }
    if (/^(asdf|qwer|zxcv|1234|jklñ|poiu)/i.test(text)) return true;
    return false;
  }
}
