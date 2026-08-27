export const MAX_PARTICIPANTS = 6;
export const ROOM_ID_PATTERN = /^[A-Z2-9]{6}$/;
export const DISPLAY_NAME_MAX_LENGTH = 32;
export const RECONNECT_DELAYS = [1_000, 2_000, 5_000, 10_000] as const;
export const OUTPUT_SIZES = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const;

export type OutputSize = keyof typeof OUTPUT_SIZES;
export type OutputFps = 30 | 60;
