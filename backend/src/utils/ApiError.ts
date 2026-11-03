/**
 * Operational errors we expect and can safely show to the client.
 * Anything that is NOT an ApiError is treated as a 500 and hidden in production.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string = "ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  static badRequest(msg = "Bad request", details?: unknown) {
    return new ApiError(400, msg, "BAD_REQUEST", details);
  }
  static unauthorized(msg = "Unauthorized") {
    return new ApiError(401, msg, "UNAUTHORIZED");
  }
  static forbidden(msg = "Forbidden") {
    return new ApiError(403, msg, "FORBIDDEN");
  }
  static notFound(msg = "Resource not found") {
    return new ApiError(404, msg, "NOT_FOUND");
  }
  static conflict(msg = "Conflict") {
    return new ApiError(409, msg, "CONFLICT");
  }
}
