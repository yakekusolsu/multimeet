import 'dotenv/config';
import type { PublicConfig } from '@multimeet/shared';

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const turnConfigured = Boolean(
  process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_PASSWORD,
);

export const config = {
  port: numberFromEnv(process.env.PORT, 3000),
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000,http://localhost:5173,https://ome.tv'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  tokenSecret: process.env.TOKEN_SECRET ?? 'development-only-change-this-secret',
  maxParticipants: Math.min(6, Math.max(1, numberFromEnv(process.env.MAX_PARTICIPANTS, 6))),
  isProduction: process.env.NODE_ENV === 'production',
};

export const publicConfig: PublicConfig = {
  publicUrl: config.publicUrl,
  maxParticipants: config.maxParticipants,
  iceServers: [
    { urls: process.env.STUN_URL ?? 'stun:stun.l.google.com:19302' },
    ...(turnConfigured
      ? [
          {
            urls: process.env.TURN_URL!,
            username: process.env.TURN_USERNAME!,
            credential: process.env.TURN_PASSWORD!,
          },
        ]
      : []),
  ],
};
