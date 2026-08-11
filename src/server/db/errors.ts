/** Domain/validation error that maps to a clean HTTP status (default 422). */
export class AppError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 422, code = "APP_ERROR") {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}
