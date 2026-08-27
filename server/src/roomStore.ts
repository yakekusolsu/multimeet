import { randomInt } from 'node:crypto';
import type { ParticipantSummary, RoomState } from '@multimeet/shared';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export interface RoomRecord {
  id: string;
  hostToken: string;
  guestToken: string;
  passwordHash: string | null;
  maxParticipants: number;
  createdAt: number;
  participants: Map<string, ParticipantSummary>;
  hostDisconnectTimer?: NodeJS.Timeout;
}

function roomId(): string {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join('');
}

export class RoomStore {
  private readonly rooms = new Map<string, RoomRecord>();

  create(input: Omit<RoomRecord, 'id' | 'createdAt' | 'participants'>): RoomRecord {
    let id = roomId();
    while (this.rooms.has(id)) id = roomId();
    const room: RoomRecord = { ...input, id, createdAt: Date.now(), participants: new Map() };
    this.rooms.set(id, room);
    return room;
  }

  get(id: string): RoomRecord | undefined {
    return this.rooms.get(id);
  }

  delete(id: string): boolean {
    const room = this.rooms.get(id);
    if (room?.hostDisconnectTimer) clearTimeout(room.hostDisconnectTimer);
    return this.rooms.delete(id);
  }

  state(room: RoomRecord): RoomState {
    return {
      id: room.id,
      maxParticipants: room.maxParticipants,
      createdAt: room.createdAt,
      participants: [...room.participants.values()],
    };
  }

  activeCount(room: RoomRecord): number {
    return [...room.participants.values()].filter((participant) => participant.role !== 'output')
      .length;
  }
}

export const rooms = new RoomStore();
