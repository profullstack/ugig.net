export declare class ApiError extends Error {
    statusCode: number;
    body: Record<string, unknown>;
    constructor(statusCode: number, body: Record<string, unknown>);
}
export declare const EXIT_SUCCESS = 0;
export declare const EXIT_API_ERROR = 1;
export declare const EXIT_VALIDATION_ERROR = 2;
export declare const EXIT_CONFIG_ERROR = 3;
export declare const EXIT_NETWORK_ERROR = 4;
