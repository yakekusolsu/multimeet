import { describe, expect, it } from 'vitest';
import { RoomStore } from './roomStore.js';

describe('RoomStore', () => {
  it('creates and ends a room', () => {
    const store = new RoomStore();
    const room = store.create({
      hostToken: 'host',
      guestToken: 'guest',
      passwordHash: null,
      maxParticipants: 6,
    });
    expect(room.id).toMatch(/^[A-Z2-9]{6}$/);
    expect(store.get(room.id)).toBe(room);
    expect(store.delete(room.id)).toBe(true);
    expect(store.get(room.id)).toBeUndefined();
  });

  it('counts host and guests but not output viewers', () => {
    const store = new RoomStore();
    const room = store.create({
      hostToken: 'h',
      guestToken: 'g',
      passwordHash: null,
      maxParticipants: 6,
    });
    room.participants.set('host', {
      id: 'host',
      displayName: 'Host',
      role: 'host',
      cameraEnabled: true,
      microphoneEnabled: true,
      screenSharing: false,
      connectionState: 'connected',
      ping: 0,
    });
    room.participants.set('obs', {
      id: 'obs',
      displayName: 'OBS',
      role: 'output',
      cameraEnabled: false,
      microphoneEnabled: false,
      screenSharing: false,
      connectionState: 'connected',
      ping: 0,
    });
    expect(store.activeCount(room)).toBe(1);
  });
});
