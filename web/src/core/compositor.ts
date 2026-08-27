import {
  OUTPUT_SIZES,
  layoutRects,
  pinnedRects,
  type VisualSettings,
  type Rect,
} from '@multimeet/shared';

export interface CompositeSource {
  id: string;
  displayName: string;
  stream: MediaStream;
  cameraEnabled: boolean;
  hidden?: boolean;
  avatarUrl?: string;
}

export class VideoCompositor {
  readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly videos = new Map<string, HTMLVideoElement>();
  private sources: CompositeSource[] = [];
  private frameRequest = 0;
  private pinnedId: string | null = null;
  private soloId: string | null = null;
  private backgroundImage: HTMLImageElement | null = null;

  constructor(
    private settings: VisualSettings,
    canvas?: HTMLCanvasElement,
  ) {
    this.canvas = canvas ?? document.createElement('canvas');
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Canvas 2Dを初期化できません。');
    this.context = context;
    this.applySettings(settings);
  }

  get stream(): MediaStream {
    return this.canvas.captureStream(this.settings.fps);
  }

  applySettings(settings: VisualSettings): void {
    this.settings = settings;
    const size = OUTPUT_SIZES[settings.outputSize];
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    this.backgroundImage = settings.backgroundImage
      ? Object.assign(new Image(), { src: settings.backgroundImage })
      : null;
  }

  setSources(sources: CompositeSource[]): void {
    this.sources = sources;
    const ids = new Set(sources.map((source) => source.id));
    for (const [id, video] of this.videos)
      if (!ids.has(id)) {
        video.srcObject = null;
        this.videos.delete(id);
      }
    for (const source of sources) {
      let video = this.videos.get(source.id);
      if (!video) {
        video = document.createElement('video');
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        this.videos.set(source.id, video);
      }
      if (video.srcObject !== source.stream) {
        video.srcObject = source.stream;
        void video.play().catch(() => undefined);
      }
    }
  }

  reorder(sourceId: string, targetId: string): void {
    const sourceIndex = this.sources.findIndex((source) => source.id === sourceId);
    const targetIndex = this.sources.findIndex((source) => source.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = this.sources.splice(sourceIndex, 1);
    if (moved) this.sources.splice(targetIndex, 0, moved);
  }

  setPinned(id: string | null): void {
    this.pinnedId = this.pinnedId === id ? null : id;
  }
  toggleSolo(id: string): void {
    this.soloId = this.soloId === id ? null : id;
  }
  orderedIds(): string[] {
    return this.sources.map((source) => source.id);
  }

  start(): void {
    if (!this.frameRequest) this.draw();
  }
  stop(): void {
    cancelAnimationFrame(this.frameRequest);
    this.frameRequest = 0;
  }

  private draw = (): void => {
    const { width, height } = this.canvas;
    this.context.fillStyle = this.settings.background;
    this.context.fillRect(0, 0, width, height);
    if (this.backgroundImage?.complete)
      this.drawCover(this.backgroundImage, { x: 0, y: 0, width, height });
    const visible = this.sources.filter(
      (source) => !source.hidden && (!this.soloId || source.id === this.soloId),
    );
    const pinnedIndex = visible.findIndex((source) => source.id === this.pinnedId);
    const rects = this.soloId
      ? layoutRects(visible.length, width, height)
      : pinnedRects(visible.length, width, height, pinnedIndex);
    visible.forEach((source, index) => this.drawSource(source, rects[index]!));
    this.frameRequest = requestAnimationFrame(this.draw);
  };

  private drawSource(source: CompositeSource, rect: Rect): void {
    const video = this.videos.get(source.id);
    this.context.save();
    this.context.beginPath();
    this.context.rect(rect.x, rect.y, rect.width, rect.height);
    this.context.clip();
    if (source.cameraEnabled && video?.readyState && video.videoWidth) this.drawCover(video, rect);
    else this.drawAvatar(source, rect);
    if (this.settings.showNames) {
      const fontSize = Math.max(18, Math.round(this.canvas.width / 55));
      this.context.font = `600 ${fontSize}px system-ui, sans-serif`;
      const textWidth = this.context.measureText(source.displayName).width;
      this.context.fillStyle = 'rgba(8, 11, 18, .72)';
      this.context.fillRect(
        rect.x + 16,
        rect.y + rect.height - fontSize - 28,
        textWidth + 24,
        fontSize + 16,
      );
      this.context.fillStyle = '#fff';
      this.context.fillText(source.displayName, rect.x + 28, rect.y + rect.height - 24);
    }
    this.context.restore();
  }

  private drawAvatar(source: CompositeSource, rect: Rect): void {
    this.context.fillStyle = '#181b24';
    this.context.fillRect(rect.x, rect.y, rect.width, rect.height);
    const radius = Math.min(rect.width, rect.height) * 0.16;
    this.context.beginPath();
    this.context.arc(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2 - radius * 0.25,
      radius,
      0,
      Math.PI * 2,
    );
    this.context.fillStyle = '#5865f2';
    this.context.fill();
    this.context.fillStyle = '#fff';
    this.context.font = `700 ${radius}px system-ui`;
    this.context.textAlign = 'center';
    this.context.textBaseline = 'middle';
    this.context.fillText(
      source.displayName.slice(0, 1).toUpperCase(),
      rect.x + rect.width / 2,
      rect.y + rect.height / 2 - radius * 0.25,
    );
    this.context.textAlign = 'start';
    this.context.textBaseline = 'alphabetic';
  }

  private drawCover(media: HTMLVideoElement | HTMLImageElement, rect: Rect): void {
    const sourceWidth = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
    const sourceHeight =
      media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
    const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    this.context.drawImage(
      media,
      rect.x + (rect.width - width) / 2,
      rect.y + (rect.height - height) / 2,
      width,
      height,
    );
  }
}
