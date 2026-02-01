export class ApiError extends Error {
    statusCode;
    body;
    constructor(statusCode, body) {
        const message = body.error || `API error: ${statusCode}`;
        super(message);
        this.name = "ApiError";
        this.statusCode = statusCode;
        this.body = body;
    }
}
export const EXIT_SUCCESS = 0;
export const EXIT_API_ERROR = 1;
export const EXIT_VALIDATION_ERROR = 2;
export const EXIT_CONFIG_ERROR = 3;
export const EXIT_NETWORK_ERROR = 4;
//# sourceMappingURL=errors.js.map