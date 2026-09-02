import { GameEntry } from './games-database';
export interface VotedGameSummary {
    id: string;
    name: string;
    category: string;
    votesCount: number;
    voters: string[];
}
export interface GamePickerState {
    votingState: 'IDLE' | 'VOTING' | 'SPINNING' | 'WINNER' | 'COOLDOWN';
    duration: number;
    timeRemaining: number;
    totalVotes: number;
    votedGames: VotedGameSummary[];
    previouslyWonGames: string[];
    enabledGameIds: string[];
    enabledGames: {
        id: string;
        name: string;
        category: string;
        platform?: string;
    }[];
    winningGame: {
        id: string;
        name: string;
        category: string;
        votedBy: string[];
    } | null;
    activeTheme: string;
}
export declare class GamePickerService {
    private readonly logger;
    private configPath;
    private customGames;
    private deletedGameIds;
    private enabledGameIds;
    private previouslyWonGames;
    private activeVotes;
    private votingState;
    private duration;
    private timeRemaining;
    private winningGame;
    private activeTheme;
    private votingTimer;
    private lifecycleTimer;
    onSendMessageToChat: ((msg: string) => void) | null;
    onBroadcastState: ((state: GamePickerState) => void) | null;
    onBroadcastSpinStarted: ((payload: any) => void) | null;
    constructor();
    private getCandidateFilePaths;
    private loadConfig;
    private saveConfig;
    getAllCatalogGames(): GameEntry[];
    searchCatalog(query?: string, page?: number, pageSize?: number): {
        games: {
            isEnabled: boolean;
            hasWonToday: boolean;
            id: string;
            name: string;
            category: string;
            platform?: string;
            keywords?: string[];
            isMultiPlatformMod?: boolean;
        }[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
    };
    enableGame(id: string): boolean;
    disableGame(id: string): boolean;
    addCustomGame(name: string, category?: string): GameEntry;
    deleteGame(id: string): boolean;
    resetPreviouslyWonGames(): void;
    setTheme(theme: string): void;
    startVoting(durationSeconds?: number): void;
    stopVotingManual(): void;
    private generateTapeSequence;
    private startSpinSequence;
    private announceWinnerSequence;
    private shutdownSequence;
    private clearVotingTimer;
    private clearAllTimers;
    processVote(username: string, rawInput: string): {
        success: boolean;
        message?: string;
    };
    private getVotedSummaries;
    private pickWeightedWinner;
    getState(): GamePickerState;
    private broadcastCurrentState;
    private deleetText;
    private isSubmodeAlreadyWon;
    private isGameAlreadyWon;
    private normalizeText;
    private isSimilar;
    private calculateSimilarity;
    private levenshteinDistance;
    private isGibberish;
}
