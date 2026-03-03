export interface UgigConfig {
    api_key?: string;
    base_url: string;
}
export declare function getConfigDir(): string;
export declare function getConfigPath(): string;
export declare function loadConfig(): UgigConfig;
export declare function saveConfig(updates: Partial<UgigConfig>): void;
export declare function getApiKey(override?: string): string;
export declare function getBaseUrl(override?: string): string;
export declare class ConfigError extends Error {
    constructor(message: string);
}
