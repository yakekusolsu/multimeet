import { describe, expect, it } from 'vitest';
import { layoutRects, pinnedRects } from './layout.js';

describe('layoutRects', () => {
  it.each([1, 2, 3, 4, 5, 6])('creates %i non-overflowing tiles', (count) => {
    const rects = layoutRects(count, 1280, 720);
    expect(rects).toHaveLength(count);
    expect(
      rects.every(
        (rect) =>
          rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= 1280 && rect.y + rect.height <= 720,
      ),
    ).toBe(true);
  });

  it('gives a pinned participant the largest tile', () => {
    const rects = pinnedRects(4, 1280, 720, 2);
    expect(rects[2]!.width * rects[2]!.height).toBeGreaterThan(rects[0]!.width * rects[0]!.height);
  });
});
