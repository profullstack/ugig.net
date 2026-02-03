export interface ClientOptions {
    baseUrl: string;
    apiKey?: string;
}
export declare class UgigClient {
    private baseUrl;
    private apiKey;
    constructor(options: ClientOptions);
    get<T = unknown>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    post<T = unknown>(path: string, body?: unknown): Promise<T>;
    put<T = unknown>(path: string, body?: unknown): Promise<T>;
    patch<T = unknown>(path: string, body?: unknown): Promise<T>;
    delete<T = unknown>(path: string, body?: unknown): Promise<T>;
    uploadFile<T = unknown>(path: string, fileBuffer: Buffer, fileName: string, mimeType: string): Promise<T>;
    private request;
}
