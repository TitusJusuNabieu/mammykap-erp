export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly message: string,
    public readonly statusCode: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('UNAUTHORIZED', message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409);
  }
}

export class AccountingError extends AppError {
  constructor(message: string) {
    super('ACCOUNTING_ERROR', message, 422);
  }
}

export class InsufficientStockError extends AppError {
  constructor(productId: string, requested: number, available: number) {
    super(
      'INSUFFICIENT_STOCK',
      `Insufficient stock for product ${productId}: requested ${requested}, available ${available}`,
      422,
    );
  }
}

export class PlanLimitError extends AppError {
  constructor(resource: string, current: number, max: number, plan: string) {
    super(
      'PLAN_LIMIT_EXCEEDED',
      `You have reached the ${max} ${resource} limit on the ${plan} plan`,
      402,
      { resource, current, max, plan },
    );
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many attempts. Please try again later.') {
    super('TOO_MANY_REQUESTS', message, 429);
  }
}

export class PeriodClosedError extends AppError {
  constructor(date: string) {
    super('PERIOD_CLOSED', `Fiscal period for date ${date} is closed`, 422);
  }
}

export class SubscriptionInactiveError extends AppError {
  constructor(status: string) {
    super(
      'SUBSCRIPTION_INACTIVE',
      `Your subscription is ${status}. Please update billing to continue.`,
      402,
      { status },
    );
  }
}
