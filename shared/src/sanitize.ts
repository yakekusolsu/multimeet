import { DISPLAY_NAME_MAX_LENGTH, ROOM_ID_PATTERN } from './constants.js';

export function sanitizeDisplayName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>\u0000-\u001f]/g, '')
    .trim()
    .slice(0, DISPLAY_NAME_MAX_LENGTH);
}

export function normalizeRoomId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return ROOM_ID_PATTERN.test(normalized) ? normalized : null;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
