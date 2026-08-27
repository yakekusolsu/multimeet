import { describe, expect, it, vi } from 'vitest';
import { stopStream } from './media';

describe('stopStream', () => {
  it('stops every media track during cleanup', () => {
    const videoStop = vi.fn();
    const audioStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: videoStop }, { stop: audioStop }],
    } as unknown as MediaStream;
    stopStream(stream);
    expect(videoStop).toHaveBeenCalledOnce();
    expect(audioStop).toHaveBeenCalledOnce();
  });

  it('accepts an absent stream', () => {
    expect(() => stopStream(null)).not.toThrow();
  });
});
