export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function unavailable() {
  return new HttpError(503, 'DB_UNAVAILABLE', '방명록에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
}

export function errorBody(code, message) {
  return { error: { code, message } };
}
