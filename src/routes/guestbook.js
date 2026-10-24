import { Router, json } from 'express';
import { rateLimit } from 'express-rate-limit';
import { HttpError, errorBody, unavailable } from '../errors.js';

const invalid = message => new HttpError(400, 'INVALID_INPUT', message);

function field(value, label, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || value.includes('\0')) {
    throw invalid(`${label}을 올바른 문자열로 입력해주세요.`);
  }
  const trimmed = value.trim();
  const length = [...trimmed].length;
  if (length < 1 || length > max) throw invalid(`${label}은 1~${max}자까지 입력할 수 있습니다.`);
  return trimmed;
}

export function guestbookRouter(pool, { writeLimit = 5, windowMs = 60000 } = {}) {
  const router = Router();
  router.get('/', async (req, res) => {
    const { limit = '20', before } = req.query;
    if (Object.keys(req.query).some(key => !['limit', 'before'].includes(key)) ||
        typeof limit !== 'string' || !/^[1-9]\d?$/.test(limit) || Number(limit) > 50 ||
        before !== undefined && (typeof before !== 'string' || !/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) {
      throw invalid('limit은 1~50, before는 유효한 글 ID여야 합니다.');
    }
    let result;
    try {
      result = await pool.query(`SELECT id, name, message, created_at FROM guestbook_entries
        WHERE ($1::bigint IS NULL OR id < $1::bigint) ORDER BY id DESC LIMIT $2`, [before ?? null, Number(limit) + 1]);
    } catch { throw unavailable(); }
    const items = result.rows.slice(0, Number(limit));
    res.json({ items, nextCursor: result.rows.length > Number(limit) ? items.at(-1).id : null });
  });
  router.post('/', rateLimit({
    windowMs,
    limit: writeLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    // Direct connections intentionally ignore forwarded headers until router CIDRs are verified.
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => res.status(429).json(errorBody('RATE_LIMITED', '작성 요청이 많습니다. 잠시 후 다시 시도해주세요.')),
  }), json({ limit: '12kb', strict: true }), async (req, res) => {
    if (!req.is('application/json')) throw new HttpError(400, 'INVALID_INPUT', 'JSON 형식으로 전송해주세요.');
    const name = field(req.body?.name, '이름', 40);
    const message = field(req.body?.message, '메시지', 1000);
    let result;
    try {
      result = await pool.query(`INSERT INTO guestbook_entries (name, message) VALUES ($1, $2)
        RETURNING id, name, message, created_at`, [name, message]);
    } catch { throw unavailable(); }
    res.status(201).json(result.rows[0]);
  });
  return router;
}
