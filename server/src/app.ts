import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import {
  MAX_PARTICIPANTS,
  normalizeRoomId,
  sanitizeDisplayName,
  type AdmissionRequest,
  type CreateRoomRequest,
} from '@multimeet/shared';
import {
  createOpaqueToken,
  createToken,
  hashPassword,
  verifyPassword,
  verifyToken,
} from './auth.js';
import { config, publicConfig } from './config.js';
import { rooms } from './roomStore.js';

export const app = express();

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.allowedOrigins, credentials: false }));
app.use(express.json({ limit: '16kb', type: 'application/json' }));
app.use(
  '/api',
  rateLimit({ windowMs: 60_000, limit: 100, standardHeaders: true, legacyHeaders: false }),
);

app.get('/api/config', (_request, response) => response.json(publicConfig));

app.post('/api/rooms', async (request, response) => {
  const body = request.body as Partial<CreateRoomRequest>;
  const hostName = sanitizeDisplayName(body.hostName);
  if (!hostName) return response.status(400).json({ error: '表示名を入力してください。' });
  const requestedMax = Number(body.maxParticipants);
  const maxParticipants = Math.min(
    config.maxParticipants,
    MAX_PARTICIPANTS,
    Math.max(1, Number.isFinite(requestedMax) ? requestedMax : 6),
  );
  const password = typeof body.password === 'string' ? body.password.slice(0, 128) : '';
  const hostToken = createOpaqueToken();
  const guestToken = createOpaqueToken();
  const room = rooms.create({
    hostToken,
    guestToken,
    passwordHash: password ? await hashPassword(password) : null,
    maxParticipants,
  });
  const socketToken = createToken({ roomId: room.id, role: 'host', displayName: hostName });
  return response.status(201).json({
    roomId: room.id,
    hostToken: `${hostToken}.${socketToken}`,
    guestToken,
    inviteUrl: `${config.publicUrl}/join/${room.id}?t=${encodeURIComponent(guestToken)}`,
    config: publicConfig,
  });
});

app.post('/api/rooms/:roomId/admission', async (request, response) => {
  const id = normalizeRoomId(request.params.roomId);
  const body = request.body as Partial<AdmissionRequest>;
  const room = id ? rooms.get(id) : undefined;
  if (!room) return response.status(404).json({ error: 'Roomが存在しません。' });
  if (body.guestToken !== room.guestToken)
    return response.status(403).json({ error: '招待Tokenが無効です。' });
  if (rooms.activeCount(room) >= room.maxParticipants)
    return response.status(409).json({ error: 'Roomが満員です。' });
  const password = typeof body.password === 'string' ? body.password.slice(0, 128) : '';
  if (!(await verifyPassword(password, room.passwordHash)))
    return response.status(401).json({ error: 'Passwordが違います。' });
  const displayName = sanitizeDisplayName(body.displayName);
  if (!displayName) return response.status(400).json({ error: '表示名を入力してください。' });
  return response.json({
    token: createToken({ roomId: room.id, role: 'guest', displayName }),
    config: publicConfig,
  });
});

app.post('/api/rooms/:roomId/output-token', (request, response) => {
  const id = normalizeRoomId(request.params.roomId);
  const room = id ? rooms.get(id) : undefined;
  if (!room) return response.status(404).json({ error: 'Roomが存在しません。' });
  const raw = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const separator = raw.indexOf('.');
  const opaque = separator >= 0 ? raw.slice(0, separator) : raw;
  const signed = separator >= 0 ? raw.slice(separator + 1) : '';
  const token = signed ? verifyToken(signed) : null;
  if (opaque !== room.hostToken || token?.role !== 'host' || token.roomId !== room.id)
    return response.status(403).json({ error: 'Host権限が必要です。' });
  return response.json({
    token: createToken(
      { roomId: room.id, role: 'output', displayName: 'OBS Output' },
      60 * 60 * 1_000,
    ),
  });
});

app.delete('/api/rooms/:roomId', (request, response) => {
  const id = normalizeRoomId(request.params.roomId);
  const room = id ? rooms.get(id) : undefined;
  if (!room) return response.status(404).json({ error: 'Roomが存在しません。' });
  const raw = request.header('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const separator = raw.indexOf('.');
  const opaque = separator >= 0 ? raw.slice(0, separator) : raw;
  const signed = separator >= 0 ? raw.slice(separator + 1) : '';
  const token = signed ? verifyToken(signed) : null;
  if (opaque !== room.hostToken || token?.role !== 'host' || token.roomId !== room.id)
    return response.status(403).json({ error: 'Host権限が必要です。' });
  request.app.get('io')?.to(room.id).emit('room-ended');
  rooms.delete(room.id);
  return response.status(204).end();
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.resolve(currentDir, '../../web/dist');
app.use(express.static(webDist));
app.get('*', (_request, response) => response.sendFile(path.join(webDist, 'index.html')));
