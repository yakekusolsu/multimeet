import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
import type { RoomState } from '@multimeet/shared';
import { createToken } from './auth.js';
import { rooms, type RoomRecord } from './roomStore.js';
import { registerSocketServer } from './socket.js';

interface Harness {
  http: HttpServer;
  io: Server;
  url: string;
  room: RoomRecord;
  clients: ClientSocket[];
}
const harnesses: Harness[] = [];

async function harness(maxParticipants = 6): Promise<Harness> {
  const http = createServer();
  const io = new Server(http);
  registerSocketServer(io);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const port = (http.address() as AddressInfo).port;
  const room = rooms.create({
    hostToken: 'host',
    guestToken: 'guest',
    passwordHash: null,
    maxParticipants,
  });
  const value = { http, io, url: `http://127.0.0.1:${port}`, room, clients: [] };
  harnesses.push(value);
  return value;
}

async function join(
  value: Harness,
  role: 'host' | 'guest',
  displayName: string,
): Promise<ClientSocket> {
  const token = createToken({ roomId: value.room.id, role, displayName });
  const client = createClient(value.url, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
  });
  value.clients.push(client);
  await new Promise<void>((resolve, reject) => {
    client.once('connect', resolve);
    client.once('connect_error', reject);
  });
  await new Promise<void>((resolve, reject) =>
    client.emit('join-room', (result: { ok: boolean; error?: string }) =>
      result.ok ? resolve() : reject(new Error(result.error)),
    ),
  );
  return client;
}

afterEach(async () => {
  while (harnesses.length) {
    const value = harnesses.pop()!;
    value.clients.forEach((client) => client.disconnect());
    rooms.delete(value.room.id);
    await new Promise<void>((resolve) => value.io.close(() => value.http.close(() => resolve())));
  }
});

describe('signaling room lifecycle', () => {
  it.each([2, 4, 6])('connects %i participants', async (count) => {
    const value = await harness(count);
    await join(value, 'host', 'Host');
    for (let index = 1; index < count; index += 1) await join(value, 'guest', `Guest ${index}`);
    expect(value.room.participants.size).toBe(count);
  });

  it('updates camera/microphone state and removes a guest on exit', async () => {
    const value = await harness();
    const host = await join(value, 'host', 'Host');
    const guest = await join(value, 'guest', 'Guest');
    const state = new Promise<RoomState>((resolve) =>
      host.on('room-state', (next: RoomState) => {
        const target = next.participants.find((p) => p.id === guest.id);
        if (target && !target.cameraEnabled && !target.microphoneEnabled) resolve(next);
      }),
    );
    guest.emit('media-state', {
      cameraEnabled: false,
      microphoneEnabled: false,
      screenSharing: false,
    });
    expect((await state).participants.find((p) => p.id === guest.id)?.cameraEnabled).toBe(false);
    guest.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(value.room.participants.size).toBe(1);
  });

  it('allows a guest to reconnect with the same signed token', async () => {
    const value = await harness();
    await join(value, 'host', 'Host');
    const guest = await join(value, 'guest', 'Guest');
    const token = guest.auth.token as string;
    guest.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const replacement = createClient(value.url, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    value.clients.push(replacement);
    await new Promise<void>((resolve) => replacement.once('connect', resolve));
    await new Promise<void>((resolve) =>
      replacement.emit('join-room', (result: { ok: boolean }) => {
        expect(result.ok).toBe(true);
        resolve();
      }),
    );
    expect(value.room.participants.size).toBe(2);
  });
});
