export interface GameEntry {
    id: string;
    name: string;
    category: string;
    platform?: string;
    keywords?: string[];
    isMultiPlatformMod?: boolean;
}
export declare const GAMES_CATALOG: GameEntry[];
