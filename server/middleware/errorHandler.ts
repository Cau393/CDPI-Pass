import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error("Error occurred:", {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      message: "Dados inválidos",
      errors: err.errors.map(error => ({
        field: error.path.join("."),
        message: error.message,
      })),
    });
    return;
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError") {
    res.status(401).json({
      message: "Token inválido",
      code: "INVALID_TOKEN",
    });
    return;
  }

  if (err.name === "TokenExpiredError") {
    res.status(401).json({
      message: "Token expirado",
      code: "TOKEN_EXPIRED",
    });
    return;
  }

  // Handle database errors
  if (err.message?.includes("unique constraint")) {
    res.status(409).json({
      message: "Dados já existem no sistema",
      code: "DUPLICATE_ENTRY",
    });
    return;
  }

  // Handle payment errors
  if (err.message?.includes("Asaas")) {
    res.status(400).json({
      message: "Erro no processamento do pagamento",
      code: "PAYMENT_ERROR",
    });
    return;
  }

  // Handle email errors
  if (err.message?.includes("SendGrid") || err.message?.includes("email")) {
    res.status(500).json({
      message: "Erro no envio de email",
      code: "EMAIL_ERROR",
    });
    return;
  }

  // Handle file upload errors
  if (err.message?.includes("file size") || err.message?.includes("upload")) {
    res.status(413).json({
      message: "Erro no upload do arquivo",
      code: "FILE_UPLOAD_ERROR",
    });
    return;
  }

  // Handle rate limit errors
  if (err.message?.includes("rate limit")) {
    res.status(429).json({
      message: "Muitas tentativas. Tente novamente mais tarde.",
      code: "RATE_LIMIT_EXCEEDED",
    });
    return;
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 
    ? "Erro interno do servidor" 
    : err.message || "Erro desconhecido";

  res.status(statusCode).json({
    message,
    code: err.code || "INTERNAL_ERROR",
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    message: "Recurso não encontrado",
    code: "NOT_FOUND",
    path: req.path,
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Custom error classes
export class ValidationError extends Error {
  statusCode = 400;
  code = "VALIDATION_ERROR";
  
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  statusCode = 404;
  code = "NOT_FOUND";
  
  constructor(message: string = "Recurso não encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends Error {
  statusCode = 401;
  code = "UNAUTHORIZED";
  
  constructor(message: string = "Não autorizado") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  statusCode = 403;
  code = "FORBIDDEN";
  
  constructor(message: string = "Acesso negado") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class ConflictError extends Error {
  statusCode = 409;
  code = "CONFLICT";
  
  constructor(message: string = "Conflito de dados") {
    super(message);
    this.name = "ConflictError";
  }
}

export class PaymentError extends Error {
  statusCode = 400;
  code = "PAYMENT_ERROR";
  
  constructor(message: string = "Erro no pagamento") {
    super(message);
    this.name = "PaymentError";
  }
}

export class EmailError extends Error {
  statusCode = 500;
  code = "EMAIL_ERROR";
  
  constructor(message: string = "Erro no envio de email") {
    super(message);
    this.name = "EmailError";
  }
}
