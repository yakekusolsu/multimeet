import { clamp } from '@multimeet/shared';

interface Input {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
}

export class AudioMixer {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private readonly inputs = new Map<string, Input>();

  get stream(): MediaStream {
    this.ensureContext();
    return this.destination!.stream;
  }

  add(id: string, stream: MediaStream, volume = 1): void {
    this.remove(id);
    if (!stream.getAudioTracks().length) return;
    this.ensureContext();
    const source = this.context!.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    const gain = this.context!.createGain();
    gain.gain.value = clamp(volume, 0, 2);
    source.connect(gain).connect(this.destination!);
    this.inputs.set(id, { source, gain });
    void this.context!.resume();
  }

  setVolume(id: string, volume: number): void {
    const input = this.inputs.get(id);
    if (input)
      input.gain.gain.setTargetAtTime(clamp(volume, 0, 2), this.context!.currentTime, 0.02);
  }

  remove(id: string): void {
    const input = this.inputs.get(id);
    input?.source.disconnect();
    input?.gain.disconnect();
    this.inputs.delete(id);
  }

  async close(): Promise<void> {
    this.inputs.forEach((_, id) => this.remove(id));
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.destination = null;
  }

  private ensureContext(): void {
    if (this.context) return;
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.destination = this.context.createMediaStreamDestination();
  }
}
