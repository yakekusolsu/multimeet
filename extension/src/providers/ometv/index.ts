import type {
  CreateRoomResponse,
  ParticipantSummary,
  RoomState,
  VisualSettings,
} from '@multimeet/shared';
import { AudioMixer } from '../../../../web/src/core/audioMixer';
import { VideoCompositor, type CompositeSource } from '../../../../web/src/core/compositor';
import { MeetingPeer } from '../../../../web/src/core/peer';
import type { ExtensionState, ProviderCommand } from '../../types';

const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
const nativeAddTrack = RTCPeerConnection.prototype.addTrack;
const existingSitePeers = new Set<RTCPeerConnection>();
const originalSenderTracks = new Map<RTCRtpSender, MediaStreamTrack>();
const state: ExtensionState = {
  active: false,
  participants: [],
  cameraEnabled: true,
  microphoneEnabled: true,
};
let room: CreateRoomResponse | null = null;
let localStream: MediaStream | null = null;
let compositeStream: MediaStream | null = null;
let compositor: VideoCompositor | null = null;
let mixer: AudioMixer | null = null;
let peer: MeetingPeer | null = null;
const remoteStreams = new Map<string, MediaStream>();
let settings: VisualSettings = {
  outputSize: '720p',
  fps: 30,
  background: '#090b10',
  showNames: true,
};

RTCPeerConnection.prototype.addTrack = function (
  track: MediaStreamTrack,
  ...streams: MediaStream[]
): RTCRtpSender {
  const sender = nativeAddTrack.call(this, track, ...streams);
  if (!state.active) {
    existingSitePeers.add(this);
    originalSenderTracks.set(sender, track);
  }
  return sender;
};

async function attachCompositeToExistingSitePeers(): Promise<void> {
  if (!compositeStream) return;
  for (const sitePeer of existingSitePeers) {
    for (const sender of sitePeer.getSenders()) {
      const replacement =
        sender.track?.kind === 'video'
          ? compositeStream.getVideoTracks()[0]
          : sender.track?.kind === 'audio'
            ? compositeStream.getAudioTracks()[0]
            : undefined;
      if (replacement) await sender.replaceTrack(replacement.clone()).catch(() => undefined);
    }
  }
}

function publish(): void {
  window.postMessage(
    { source: 'multimeet-provider', type: 'state', state: structuredClone(state) },
    '*',
  );
}

function sources(participants: ParticipantSummary[]): CompositeSource[] {
  return participants
    .filter((p) => p.role !== 'output')
    .map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      stream:
        participant.role === 'host'
          ? localStream!
          : (remoteStreams.get(participant.id) ?? new MediaStream()),
      cameraEnabled: participant.cameraEnabled,
    }));
}

async function createRoom(command: Extract<ProviderCommand, { type: 'create' }>): Promise<void> {
  await endRoom(false);
  settings = command.settings;
  const response = await fetch(`${command.serverUrl.replace(/\/$/, '')}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hostName: command.hostName,
      password: command.password,
      maxParticipants: command.maxParticipants,
    }),
  });
  const body = (await response.json()) as CreateRoomResponse & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Room作成に失敗しました (${response.status})`);
  room = body;
  localStream = await nativeGetUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const canvas = document.createElement('canvas');
  canvas.id = 'multimeet-compositor';
  Object.assign(canvas.style, {
    position: 'fixed',
    left: '-2px',
    top: '-2px',
    width: '1px',
    height: '1px',
    opacity: '0.01',
    pointerEvents: 'none',
  });
  document.documentElement.append(canvas);
  compositor = new VideoCompositor(settings, canvas);
  compositor.start();
  mixer = new AudioMixer();
  mixer.add('host', localStream);
  compositeStream = new MediaStream([
    ...compositor.stream.getVideoTracks(),
    ...mixer.stream.getAudioTracks(),
  ]);
  const signedToken = room.hostToken.slice(room.hostToken.indexOf('.') + 1);
  const currentComposite = compositeStream;
  peer = new MeetingPeer(signedToken, room.config, localStream, 'host', {
    onRoomState: handleRoomState,
    onStream: (id, stream) => {
      remoteStreams.set(id, stream);
      mixer?.add(id, stream);
      compositor?.setSources(sources(state.participants));
    },
    onParticipantLeft: (id) => {
      remoteStreams.delete(id);
      mixer?.remove(id);
      state.participants = state.participants.filter((p) => p.id !== id);
      compositor?.setSources(sources(state.participants));
      publish();
    },
    onError: (error) => {
      state.error = error;
      publish();
    },
    onEnded: () => void endRoom(false),
  });
  function handleRoomState(next: RoomState): void {
    if (next.id) {
      state.participants = next.participants.filter((participant) => participant.role !== 'output');
      compositor?.setSources(sources(state.participants));
      publish();
    }
    for (const output of next.participants.filter((participant) => participant.role === 'output'))
      void peer?.sendCompositeToOutput(output.id, currentComposite);
  }
  await peer.join();
  state.active = true;
  state.roomId = room.roomId;
  state.inviteUrl = room.inviteUrl;
  state.error = undefined;
  await attachCompositeToExistingSitePeers();
  publish();
}

async function endRoom(notifyServer = true): Promise<void> {
  if (notifyServer && room)
    await fetch(`${room.config.publicUrl}/api/rooms/${room.roomId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${room.hostToken}` },
    }).catch(() => undefined);
  for (const sitePeer of existingSitePeers)
    for (const sender of sitePeer.getSenders()) {
      const original = originalSenderTracks.get(sender);
      if (original && original.readyState === 'live')
        await sender.replaceTrack(original).catch(() => undefined);
    }
  peer?.close();
  peer = null;
  compositor?.stop();
  compositor?.canvas.remove();
  compositor = null;
  await mixer?.close();
  mixer = null;
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  compositeStream?.getTracks().forEach((track) => track.stop());
  compositeStream = null;
  remoteStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
  remoteStreams.clear();
  room = null;
  Object.assign(state, {
    active: false,
    roomId: undefined,
    inviteUrl: undefined,
    outputUrl: undefined,
    participants: [],
    error: undefined,
    cameraEnabled: true,
    microphoneEnabled: true,
  });
  publish();
}

function toggle(kind: 'audio' | 'video'): void {
  const track =
    kind === 'audio' ? localStream?.getAudioTracks()[0] : localStream?.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  if (kind === 'audio') state.microphoneEnabled = track.enabled;
  else state.cameraEnabled = track.enabled;
  peer?.socket.emit('media-state', {
    cameraEnabled: state.cameraEnabled,
    microphoneEnabled: state.microphoneEnabled,
    screenSharing: false,
  });
  publish();
}

async function handleCommand(command: ProviderCommand): Promise<void> {
  if (command.type === 'create') return createRoom(command);
  if (command.type === 'end') return endRoom();
  if (command.type === 'prepare-output') {
    if (!room) return;
    const response = await fetch(`${room.config.publicUrl}/api/rooms/${room.roomId}/output-token`, {
      method: 'POST',
      headers: { authorization: `Bearer ${room.hostToken}` },
    });
    const value = (await response.json()) as { token?: string; error?: string };
    if (!response.ok || !value.token) throw new Error(value.error ?? 'OBS URLを作成できません。');
    state.outputUrl = `${room.config.publicUrl}/output?token=${encodeURIComponent(value.token)}`;
    publish();
    return;
  }
  if (command.type === 'toggle-camera') return toggle('video');
  if (command.type === 'toggle-microphone') return toggle('audio');
  if (command.type === 'settings') {
    settings = command.settings;
    compositor?.applySettings(settings);
    return;
  }
  if (command.type === 'volume') {
    mixer?.setVolume(command.target, command.value);
    return;
  }
  if (command.type === 'reorder') {
    compositor?.reorder(command.source, command.target);
    return;
  }
  if (command.type === 'admin') {
    if (command.action === 'pin') compositor?.setPinned(command.target);
    else if (command.action === 'solo') compositor?.toggleSolo(command.target);
    else if (command.action === 'mute' || command.action === 'kick')
      peer?.socket.emit('admin-action', { type: command.action, target: command.target });
    else peer?.socket.emit('admin-action', { type: 'hide', target: command.target, hidden: true });
  }
}

window.addEventListener('multimeet:command', (event) => {
  const command = (event as CustomEvent<ProviderCommand>).detail;
  void handleCommand(command).catch((reason) => {
    state.error = reason instanceof Error ? reason.message : '処理に失敗しました。';
    publish();
  });
});

// OmeTV固有の境界はこのProviderだけ。Room未使用時は必ずBrowser標準実装へ戻します。
navigator.mediaDevices.getUserMedia = async (
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> => {
  if (!state.active || !compositeStream || !constraints?.video)
    return nativeGetUserMedia(constraints);
  const tracks = [
    ...compositeStream.getVideoTracks().map((track) => track.clone()),
    ...(constraints.audio ? compositeStream.getAudioTracks().map((track) => track.clone()) : []),
  ];
  return new MediaStream(tracks);
};

publish();
