export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function layoutRects(count: number, width: number, height: number): Rect[] {
  if (count <= 0) return [];
  if (count === 1) return [{ x: 0, y: 0, width, height }];
  if (count === 2)
    return [0, 1].map((column) => ({ x: (column * width) / 2, y: 0, width: width / 2, height }));
  if (count === 3)
    return [
      { x: 0, y: 0, width, height: height / 2 },
      { x: 0, y: height / 2, width: width / 2, height: height / 2 },
      { x: width / 2, y: height / 2, width: width / 2, height: height / 2 },
    ];
  const columns = count <= 4 ? 2 : 3;
  const rows = 2;
  return Array.from({ length: count }, (_, index) => ({
    x: ((index % columns) * width) / columns,
    y: (Math.floor(index / columns) * height) / rows,
    width: width / columns,
    height: height / rows,
  }));
}

export function pinnedRects(
  count: number,
  width: number,
  height: number,
  pinnedIndex: number,
): Rect[] {
  if (count <= 1 || pinnedIndex < 0 || pinnedIndex >= count)
    return layoutRects(count, width, height);
  const sideWidth = width * 0.28;
  const sideHeight = height / (count - 1);
  const rects: Rect[] = [];
  let sideIndex = 0;
  for (let index = 0; index < count; index += 1) {
    rects[index] =
      index === pinnedIndex
        ? { x: 0, y: 0, width: width - sideWidth, height }
        : {
            x: width - sideWidth,
            y: sideIndex++ * sideHeight,
            width: sideWidth,
            height: sideHeight,
          };
  }
  return rects;
}
