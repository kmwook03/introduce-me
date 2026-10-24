import express from 'express';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { guestbookRouter } from './routes/guestbook.js';
import { HttpError, errorBody, unavailable } from './errors.js';

export function createApp({ pool, state = { ready: false }, trustProxy = false, rateLimit, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);
  app.set('query parser', 'simple');
  app.use(helmet({
    contentSecurityPolicy: { directives: { 'script-src': ["'self'"], 'script-src-attr': ["'none'"], 'upgrade-insecure-requests': null } },
    // TLS is terminated by the OpenShift Route; localhost development uses HTTP.
    strictTransportSecurity: false,
  }));
  app.use(['/api', '/health'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));
  app.get('/health/ready', async (_req, res) => {
    if (!state.ready || state.stopping) throw unavailable();
    try { await pool.query({ text: 'SELECT 1', query_timeout: 1500 }); }
    catch { throw unavailable(); }
    res.json({ status: 'ready' });
  });
  app.use('/api', (_req, _res, next) => {
    if (!state.ready || state.stopping) return next(unavailable());
    next();
  });
  app.use('/api/guestbook', guestbookRouter(pool, rateLimit));
  app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url)), { dotfiles: 'deny' }));
  app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', '요청한 페이지를 찾을 수 없습니다.')));
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') error = new HttpError(400, 'INVALID_JSON', '올바른 JSON을 전송해주세요.');
    if (error.type === 'entity.too.large') error = new HttpError(400, 'BODY_TOO_LARGE', '요청 본문이 너무 큽니다.');
    if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') error = new HttpError(400, 'INVALID_ENCODING', 'UTF-8 JSON을 전송해주세요.');
    const known = error instanceof HttpError;
    const status = known ? error.status : 500;
    if (status >= 500) logger.error({ event: 'request_error', code: known ? error.code : 'INTERNAL_ERROR' });
    if (status === 503) res.set('Retry-After', '5');
    res.status(status).json(errorBody(known ? error.code : 'INTERNAL_ERROR', known ? error.message : '요청을 처리할 수 없습니다.'));
  });
  return app;
}
