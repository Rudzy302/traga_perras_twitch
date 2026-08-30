import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CasinoGateway } from '../casino/casino.gateway';
export interface TwitchConfig {
    channel: string;
    botUsername?: string;
    oauthToken?: string;
    pointsCommand?: string;
    cooldownSeconds?: number;
}
export interface PrizeTier {
    weight: number;
    prizes: number[];
}
export declare class TwitchService implements OnModuleInit, OnModuleDestroy {
    private readonly casinoGateway;
    private readonly logger;
    private client;
    private isAuthenticated;
    private currentChannel;
    private currentBotUsername;
    private currentOauthToken;
    private pointsCommandPattern;
    private readonly SPIN_DURATION_MS;
    private cooldownMs;
    private readonly PRIZE_TIERS;
    readonly ALL_PRIZES_POOL: number[];
    private isSpinActive;
    private lastSpinTimestamp;
    private recentSpinUsers;
    constructor(casinoGateway: CasinoGateway);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private disconnectFromTwitch;
    private connectToTwitch;
    selectWeightedJackpotPrize(): number;
    private get PRIZES_TIERS_SAFE();
    private handleChatMessage;
    private executeSpinFlow;
    private cooldownTimers;
    private clearCooldownTimers;
    sendChatMessage(channel: string, message: string): Promise<boolean>;
    scheduleCooldownAnnouncements(channel: string): void;
    triggerTestCountdown(): Promise<{
        success: boolean;
        message: string;
    }>;
    resetCooldown(): void;
    setCooldownSeconds(seconds: number): {
        success: boolean;
        message: string;
    };
    reconfigure(config: TwitchConfig): Promise<{
        success: boolean;
        message: string;
    }>;
    getStatus(): {
        channel: string;
        botUsername: string;
        oauthToken: string;
        isAuthenticated: boolean;
        isSpinActive: boolean;
        cooldownSeconds: number;
        pointsCommand: string;
        isConfigured: boolean;
    };
    private sleep;
}
