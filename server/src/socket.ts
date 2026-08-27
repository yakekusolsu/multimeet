import type { Server, Socket } from 'socket.io';
import type { ParticipantSummary, AdminAction, MediaState, SignalPayload } from '@multimeet/shared';
import { verifyToken, type TokenPayload } from './auth.js';
import { rooms } from './roomStore.js';

type TypedServer = Server;
type TypedSocket = Socket & { data: { token?: TokenPayload; joined?: boolean } };

const HOST_GRACE_PERIOD_MS = 10_000;

export function registerSocketServer(io: TypedServer): void {
  io.use((socket: TypedSocket, next) => {
    const payload = verifyToken(socket.handshake.auth.token);
    if (!payload) return next(new Error('認証Tokenが無効です。'));
    socket.data.token = payload;
    return next();
  });

  io.on('connection', (socket: TypedSocket) => {
    const token = socket.data.token!;

    socket.on(
      'join-room',
      (
        ack: (result: {
          ok: boolean;
          error?: string;
          state?: ReturnType<typeof rooms.state>;
        }) => void,
      ) => {
        const room = rooms.get(token.roomId);
        if (!room) return ack({ ok: false, error: 'Roomが存在しません。' });
        if (
          token.role !== 'output' &&
          rooms.activeCount(room) >= room.maxParticipants &&
          ![...room.participants.values()].some(
            (p) => p.role === token.role && p.displayName === token.displayName,
          )
        ) {
          return ack({ ok: false, error: 'Roomが満員です。' });
        }
        if (token.role === 'host' && room.hostDisconnectTimer) {
          clearTimeout(room.hostDisconnectTimer);
          room.hostDisconnectTimer = undefined;
        }
        socket.join(room.id);
        socket.data.joined = true;
        const participant: ParticipantSummary = {
          id: socket.id,
          displayName: token.displayName,
          role: token.role,
          cameraEnabled: token.role !== 'output',
          microphoneEnabled: token.role !== 'output',
          screenSharing: false,
          connectionState: 'connected',
          ping: null,
        };
        room.participants.set(socket.id, participant);
        socket.to(room.id).emit('participant-joined', participant);
        io.to(room.id).emit('room-state', rooms.state(room));
        return ack({ ok: true, state: rooms.state(room) });
      },
    );

    socket.on('signal', (payload: SignalPayload) => {
      if (!socket.data.joined || typeof payload.target !== 'string') return;
      const room = rooms.get(token.roomId);
      if (!room?.participants.has(payload.target)) return;
      io.to(payload.target).emit('signal', { ...payload, from: socket.id });
    });

    socket.on('media-state', (state: MediaState) => {
      const room = rooms.get(token.roomId);
      const participant = room?.participants.get(socket.id);
      if (!room || !participant) return;
      participant.cameraEnabled = Boolean(state.cameraEnabled);
      participant.microphoneEnabled = Boolean(state.microphoneEnabled);
      participant.screenSharing = Boolean(state.screenSharing);
      io.to(room.id).emit('room-state', rooms.state(room));
    });

    socket.on('admin-action', (action: AdminAction) => {
      if (token.role !== 'host') return;
      const room = rooms.get(token.roomId);
      const target = room?.participants.get(action.target);
      if (!room || !target || target.role === 'host') return;
      io.to(action.target).emit('admin-action', action);
      if (action.type === 'kick') io.sockets.sockets.get(action.target)?.disconnect(true);
    });

    socket.on('ping', (sentAt: number, ack: (value: number) => void) => {
      const room = rooms.get(token.roomId);
      const participant = room?.participants.get(socket.id);
      if (room && participant) {
        participant.ping = Math.min(9_999, Math.max(0, Date.now() - sentAt));
        io.to(room.id).emit('room-state', rooms.state(room));
      }
      ack(sentAt);
    });

    socket.on('disconnect', () => {
      if (!socket.data.joined) return;
      const room = rooms.get(token.roomId);
      if (!room) return;
      room.participants.delete(socket.id);
      socket.to(room.id).emit('participant-left', socket.id);
      if (token.role === 'host') {
        room.hostDisconnectTimer = setTimeout(() => {
          io.to(room.id).emit('room-ended');
          rooms.delete(room.id);
        }, HOST_GRACE_PERIOD_MS);
      } else {
        io.to(room.id).emit('room-state', rooms.state(room));
      }
    });
  });
}
