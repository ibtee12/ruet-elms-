export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode: number = 400, code: string = "APP_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required. Please sign in.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = "You do not have permission to access this resource.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "The requested resource was not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string = "Invalid request data provided.") {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class ConflictError extends AppError {
  constructor(message: string = "The resource was changed by someone else. Please retry.") {
    super(message, 409, "CONFLICT");
  }
}

/**
 * Normalizes any caught error into a typed format with status code and friendly UI message.
 */
export function formatAuthError(error: unknown): {
  statusCode: number;
  message: string;
  code: string;
} {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
    };
  }

  const message = error instanceof Error ? error.message : "An unexpected server error occurred.";
  return {
    statusCode: 500,
    message,
    code: "INTERNAL_ERROR",
  };
}
