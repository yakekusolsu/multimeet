import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('room API', () => {
  it('creates, admits a guest, rejects a wrong password, and lets only the host end the room', async () => {
    const created = await request(app)
      .post('/api/rooms')
      .send({ hostName: '<Host>', password: 'secret', maxParticipants: 6 })
      .expect(201);
    expect(created.body.roomId).toMatch(/^[A-Z2-9]{6}$/);
    await request(app)
      .post(`/api/rooms/${created.body.roomId}/admission`)
      .send({ displayName: 'Guest', password: 'wrong', guestToken: created.body.guestToken })
      .expect(401);
    const admitted = await request(app)
      .post(`/api/rooms/${created.body.roomId}/admission`)
      .send({ displayName: '<Guest>', password: 'secret', guestToken: created.body.guestToken })
      .expect(200);
    expect(admitted.body.token).toContain('.');
    await request(app).delete(`/api/rooms/${created.body.roomId}`).expect(403);
    await request(app)
      .delete(`/api/rooms/${created.body.roomId}`)
      .set('authorization', `Bearer ${created.body.hostToken}`)
      .expect(204);
  });

  it('validates the host display name', async () => {
    await request(app).post('/api/rooms').send({ hostName: '<>', maxParticipants: 6 }).expect(400);
  });
});
