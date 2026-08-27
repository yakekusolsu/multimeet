import type { OutputFps, OutputSize } from './constants.js';

export type Role = 'host' | 'guest' | 'output';
export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface PublicConfig {
  publicUrl: string;
  iceServers: IceServerConfig[];
  maxParticipants: number;
}

export interface ParticipantSummary {
  id: string;
  displayName: string;
  role: Role;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  screenSharing: boolean;
  connectionState: ConnectionState;
  ping: number | null;
}

export interface RoomState {
  id: string;
  participants: ParticipantSummary[];
  maxParticipants: number;
  createdAt: number;
}

export interface CreateRoomRequest {
  hostName: string;
  password?: string;
  maxParticipants: number;
}

export interface CreateRoomResponse {
  roomId: string;
  hostToken: string;
  guestToken: string;
  inviteUrl: string;
  config: PublicConfig;
}

export interface AdmissionRequest {
  displayName: string;
  password?: string;
  guestToken: string;
}

export interface AdmissionResponse {
  token: string;
  config: PublicConfig;
}

export interface SignalPayload {
  target: string;
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

export type AdminAction =
  | { type: 'mute'; target: string }
  | { type: 'kick'; target: string }
  | { type: 'hide'; target: string; hidden: boolean };

export interface MediaState {
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
  screenSharing: boolean;
}

export interface VisualSettings {
  outputSize: OutputSize;
  fps: OutputFps;
  background: string;
  backgroundImage?: string;
  showNames: boolean;
}

export interface ClientToServerEvents {
  'join-room': (ack: (result: { ok: boolean; error?: string; state?: RoomState }) => void) => void;
  signal: (payload: SignalPayload) => void;
  'media-state': (state: MediaState) => void;
  'admin-action': (action: AdminAction) => void;
  ping: (sentAt: number, ack: (sentAt: number) => void) => void;
}

export interface ServerToClientEvents {
  'room-state': (state: RoomState) => void;
  'participant-joined': (participant: ParticipantSummary) => void;
  'participant-left': (participantId: string) => void;
  signal: (payload: SignalPayload & { from: string }) => void;
  'admin-action': (action: AdminAction) => void;
  'room-ended': () => void;
  error: (message: string) => void;
}
