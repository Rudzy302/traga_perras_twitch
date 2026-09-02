import { OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TwitchService } from '../twitch/twitch.service';
import { GamePickerService } from '../games/game-picker.service';
export interface StartSpinPayload {
    username: string;
    prize: number;
    duration: number;
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
export declare class CasinoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly twitchService;
    private readonly gamePickerService;
    server: Server;
    private readonly logger;
    constructor(twitchService: TwitchService, gamePickerService: GamePickerService);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    emitStartSpin(payload: StartSpinPayload): void;
    handleGetStatus(client: Socket): {
        channel: string;
        botUsername: string;
        oauthToken: string;
        isAuthenticated: boolean;
        authError: string;
        isSpinActive: boolean;
        cooldownSeconds: number;
        pointsCommand: string;
        theme: string;
        announceCountdown: boolean;
        isConfigured: boolean;
        lastConsecutiveUser: string;
        consecutiveSpinsCount: number;
        maxConsecutiveSpins: number;
    };
    handleSetCredentials(client: Socket, payload: SetCredentialsPayload): Promise<{
        success: boolean;
        message: string;
    }>;
    handleTestSpin(client: Socket, payload?: {
        username?: string;
        prize?: number;
    }): {
        success: boolean;
    };
    handleResetCooldown(client: Socket): {
        success: boolean;
        message: string;
    };
    emitTwitchStatus(status: any): void;
    handleTestCountdown(client: Socket): Promise<{
        success: boolean;
        message: string;
    }>;
    handleSetCooldown(client: Socket, payload: {
        cooldownSeconds: number;
    }): {
        success: boolean;
        message: string;
    };
    handleSetTheme(client: Socket, payload: {
        theme: string;
    }): {
        success: boolean;
        theme: string;
    } | {
        success: boolean;
    };
    handleSetCountdownAnnouncement(client: Socket, payload: {
        enabled: boolean;
    }): {
        success: boolean;
        enabled: boolean;
    } | {
        success: boolean;
    };
    handleResetConsecutiveSpins(client: Socket): {
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    };
    emitGamePickerState(state: any): void;
    emitGamePickerSpinStarted(payload: any): void;
    handleGetGamePickerState(client: Socket): import("../games/game-picker.service").GamePickerState;
    handleSearchGameCatalog(client: Socket, payload: {
        query?: string;
        page?: number;
        pageSize?: number;
    }): {
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
    handleStartGamePickerVoting(client: Socket, payload: {
        durationSeconds: number;
    }): {
        success: boolean;
    };
    handleStopGamePickerVoting(client: Socket): {
        success: boolean;
    };
    handleEnableGame(client: Socket, payload: {
        id: string;
    }): {
        success: boolean;
    };
    handleDisableGame(client: Socket, payload: {
        id: string;
    }): {
        success: boolean;
    };
    handleAddCustomGame(client: Socket, payload: {
        name: string;
        category?: string;
    }): {
        success: boolean;
        game: import("../games/games-database").GameEntry;
        message?: undefined;
    } | {
        success: boolean;
        message: string;
        game?: undefined;
    };
    handleResetGameWonHistory(client: Socket): {
        success: boolean;
    };
    handleSetGamePickerTheme(client: Socket, payload: {
        theme: string;
    }): {
        success: boolean;
    };
}
