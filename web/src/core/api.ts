import type {
  AdmissionRequest,
  AdmissionResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  PublicConfig,
} from '@multimeet/shared';

async function json<T>(response: Response): Promise<T> {
  const value = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? `Request failed (${response.status})`);
  return value;
}

export const api = {
  config: () => fetch('/api/config').then((response) => json<PublicConfig>(response)),
  createRoom: (body: CreateRoomRequest) =>
    fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((response) => json<CreateRoomResponse>(response)),
  admission: (roomId: string, body: AdmissionRequest) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/admission`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((response) => json<AdmissionResponse>(response)),
  outputToken: (roomId: string, hostToken: string) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}/output-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${hostToken}` },
    }).then((response) => json<{ token: string }>(response)),
  endRoom: (roomId: string, hostToken: string) =>
    fetch(`/api/rooms/${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${hostToken}` },
    }),
};
