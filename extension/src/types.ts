import type { ParticipantSummary, VisualSettings } from '@multimeet/shared';

export interface ExtensionState {
  active: boolean;
  roomId?: string;
  inviteUrl?: string;
  outputUrl?: string;
  participants: ParticipantSummary[];
  error?: string;
  cameraEnabled: boolean;
  microphoneEnabled: boolean;
}

export type ProviderCommand =
  | {
      type: 'create';
      serverUrl: string;
      hostName: string;
      password: string;
      maxParticipants: number;
      settings: VisualSettings;
    }
  | { type: 'end' }
  | { type: 'prepare-output' }
  | { type: 'toggle-camera' }
  | { type: 'toggle-microphone' }
  | { type: 'settings'; settings: VisualSettings }
  | { type: 'admin'; action: 'mute' | 'kick' | 'hide' | 'pin' | 'solo'; target: string }
  | { type: 'volume'; target: string; value: number }
  | { type: 'reorder'; source: string; target: string };

export const DEFAULT_STATE: ExtensionState = {
  active: false,
  participants: [],
  cameraEnabled: true,
  microphoneEnabled: true,
};
