export class ApiError extends Error {
  public statusCode: number;
  public body: Record<string, unknown>;

  constructor(statusCode: number, body: Record<string, unknown>) {
    const message = (body.error as string) || `API error: ${statusCode}`;
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
