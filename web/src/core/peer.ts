import { io, type Socket } from 'socket.io-client';
import type {
  PublicConfig,
  RoomState,
  ServerToClientEvents,
  SignalPayload,
  ParticipantSummary,
} from '@multimeet/shared';

type MeetingSocket = Socket;
export type StreamHandler = (id: string, stream: MediaStream) => void;

export interface MeetingHandlers {
  onRoomState?: (state: RoomState) => void;
  onStream?: StreamHandler;
  onParticipantLeft?: (id: string) => void;
  onError?: (message: string) => void;
  onEnded?: () => void;
  onAdminAction?: (action: Parameters<ServerToClientEvents['admin-action']>[0]) => void;
}

export class MeetingPeer {
  readonly socket: MeetingSocket;
  private readonly peers = new Map<string, RTCPeerConnection>();
  private readonly pendingOutputPeers = new Set<string>();
  private readonly statsTimers = new Map<string, number>();
  private pingTimer = 0;

  constructor(
    private readonly token: string,
    private readonly config: PublicConfig,
    private readonly localStream: MediaStream | null,
    private readonly role: 'host' | 'guest' | 'output',
    private readonly handlers: MeetingHandlers,
  ) {
    this.socket = io(config.publicUrl, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      reconnectionAttempts: 4,
    });
    this.bindEvents();
  }

  async join(): Promise<RoomState> {
    const state = await new Promise<RoomState>((resolve, reject) => {
      this.socket.emit('join-room', (result: { ok: boolean; state?: RoomState; error?: string }) =>
        result.ok && result.state
          ? resolve(result.state)
          : reject(new Error(result.error ?? 'Room参加に失敗しました。')),
      );
    });
    this.pingTimer = window.setInterval(
      () => this.socket.emit('ping', Date.now(), () => undefined),
      5_000,
    );
    return state;
  }

  async connectGuestToHost(host: ParticipantSummary): Promise<void> {
    if (this.role !== 'guest' || this.peers.has(host.id)) return;
    const peer = this.createPeer(host.id);
    const stream = this.localStream;
    stream?.getTracks().forEach((track) => peer.addTrack(track, stream));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    this.socket.emit('signal', { target: host.id, description: peer.localDescription! });
  }

  async sendCompositeToOutput(outputId: string, stream: MediaStream): Promise<void> {
    if (this.role !== 'host') return;
    const existing = this.peers.get(outputId);
    if (
      this.pendingOutputPeers.has(outputId) ||
      (existing && !['failed', 'closed'].includes(existing.connectionState))
    )
      return;
    if (existing) this.closePeer(outputId);

    this.pendingOutputPeers.add(outputId);
    try {
      const peer = this.createPeer(outputId);
      const senders = stream.getTracks().map((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.configureOutputSenders(senders);
      this.socket.emit('signal', { target: outputId, description: peer.localDescription! });
    } catch (error) {
      this.closePeer(outputId);
      throw error;
    } finally {
      this.pendingOutputPeers.delete(outputId);
    }
  }

  replaceTrack(kind: 'audio' | 'video', track: MediaStreamTrack): void {
    for (const peer of this.peers.values()) {
      const sender = peer.getSenders().find((candidate) => candidate.track?.kind === kind);
      if (sender) void sender.replaceTrack(track);
    }
  }

  close(): void {
    window.clearInterval(this.pingTimer);
    this.statsTimers.forEach((timer) => window.clearInterval(timer));
    this.statsTimers.clear();
    this.peers.forEach((_, id) => this.closePeer(id));
    this.socket.disconnect();
  }

  private bindEvents(): void {
    this.socket.on('room-state', (state: RoomState) => {
      this.handlers.onRoomState?.(state);
      if (this.role === 'guest') {
        const host = state.participants.find((participant) => participant.role === 'host');
        if (host)
          void this.connectGuestToHost(host).catch((error) =>
            this.handlers.onError?.(
              error instanceof Error ? error.message : 'WebRTC接続に失敗しました。',
            ),
          );
      }
    });
    this.socket.on(
      'signal',
      (payload: SignalPayload & { from: string }) => void this.handleSignal(payload),
    );
    this.socket.on('participant-left', (id: string) => {
      this.closePeer(id);
      this.handlers.onParticipantLeft?.(id);
    });
    this.socket.on('admin-action', (action: Parameters<ServerToClientEvents['admin-action']>[0]) =>
      this.handlers.onAdminAction?.(action),
    );
    this.socket.on('room-ended', () => this.handlers.onEnded?.());
    this.socket.on('error', (message: string) => this.handlers.onError?.(message));
    this.socket.on('connect_error', () =>
      this.handlers.onError?.('WebSocketへ接続できません。自動再接続しています。'),
    );
  }

  private async handleSignal(payload: SignalPayload & { from: string }): Promise<void> {
    let peer = this.peers.get(payload.from);
    if (!peer) {
      peer = this.createPeer(payload.from);
      if (this.role === 'host' && this.localStream)
        this.localStream.getTracks().forEach((track) => peer!.addTrack(track, this.localStream!));
    }
    try {
      if (payload.description) {
        await peer.setRemoteDescription(payload.description);
        if (payload.description.type === 'offer') {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          this.socket.emit('signal', { target: payload.from, description: peer.localDescription! });
        }
      } else if (payload.candidate) await peer.addIceCandidate(payload.candidate);
    } catch (error) {
      this.handlers.onError?.(
        error instanceof Error ? error.message : 'WebRTCシグナリングに失敗しました。',
      );
    }
  }

  private createPeer(id: string): RTCPeerConnection {
    const peer = new RTCPeerConnection({ iceServers: this.config.iceServers });
    this.peers.set(id, peer);
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.socket.emit('signal', { target: id, candidate: candidate.toJSON() });
    };
    peer.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (stream) this.handlers.onStream?.(id, stream);
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed'].includes(peer.connectionState)) this.closePeer(id);
      if (peer.connectionState === 'connected') this.monitorQuality(id, peer);
    };
    return peer;
  }

  private monitorQuality(id: string, peer: RTCPeerConnection): void {
    if (this.statsTimers.has(id)) return;
    let previousLost = 0;
    const timer = window.setInterval(async () => {
      const stats = await peer.getStats();
      let lost = 0;
      let received = 0;
      stats.forEach((report) => {
        if (report.type === 'inbound-rtp') {
          lost += report.packetsLost ?? 0;
          received += report.packetsReceived ?? 0;
        }
      });
      const lossDelta = lost - previousLost;
      previousLost = lost;
      if (lossDelta > 8 && received > 0) {
        for (const sender of peer
          .getSenders()
          .filter((candidate) => candidate.track?.kind === 'video')) {
          const parameters = sender.getParameters();
          if (!parameters.encodings.length) parameters.encodings = [{}];
          parameters.encodings[0]!.maxBitrate = 650_000;
          parameters.encodings[0]!.maxFramerate = 20;
          await sender.setParameters(parameters).catch(() => undefined);
        }
      }
    }, 5_000);
    this.statsTimers.set(id, timer);
  }

  private async configureOutputSenders(senders: RTCRtpSender[]): Promise<void> {
    for (const sender of senders) {
      const track = sender.track;
      if (!track) continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings.length) parameters.encodings = [{}];

      if (track.kind === 'video') {
        track.contentHint = 'motion';
        const settings = track.getSettings();
        const width = settings.width ?? 1280;
        parameters.degradationPreference = 'maintain-resolution';
        parameters.encodings[0]!.maxBitrate = width >= 1920 ? 12_000_000 : 6_000_000;
        parameters.encodings[0]!.maxFramerate = settings.frameRate ?? 30;
        parameters.encodings[0]!.scaleResolutionDownBy = 1;
      } else if (track.kind === 'audio') {
        parameters.encodings[0]!.maxBitrate = 192_000;
      }

      await sender.setParameters(parameters).catch(() => undefined);
    }
  }

  private closePeer(id: string): void {
    this.pendingOutputPeers.delete(id);
    const timer = this.statsTimers.get(id);
    if (timer) window.clearInterval(timer);
    this.statsTimers.delete(id);
    const peer = this.peers.get(id);
    if (!peer) return;
    peer.ontrack = null;
    peer.onicecandidate = null;
    peer.close();
    this.peers.delete(id);
  }
}
