import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera,
  CameraOff,
  Copy,
  Image,
  LogOut,
  Mic,
  MicOff,
  MonitorUp,
  Settings,
  UserPlus,
} from '../icons';
import type {
  CreateRoomResponse,
  ParticipantSummary,
  RoomState,
  VisualSettings,
} from '@multimeet/shared';
import { api } from '../core/api';
import { AudioMixer } from '../core/audioMixer';
import { VideoCompositor, type CompositeSource } from '../core/compositor';
import { stopStream } from '../core/media';
import { MeetingPeer } from '../core/peer';
import { DeviceSetup } from '../components/DeviceSetup';
import { ParticipantCard } from '../components/ParticipantCard';

const DEFAULT_SETTINGS: VisualSettings = {
  outputSize: '720p',
  fps: 30,
  background: '#090b10',
  showNames: true,
};

export function HostPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compositorRef = useRef<VideoCompositor>();
  const mixerRef = useRef<AudioMixer>();
  const peerRef = useRef<MeetingPeer>();
  const localRef = useRef<MediaStream>();
  const streamsRef = useRef(new Map<string, MediaStream>());
  const draggedRef = useRef<string>();
  const [room, setRoom] = useState<CreateRoomResponse>();
  const [state, setState] = useState<RoomState>();
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [settings, setSettings] = useState<VisualSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...JSON.parse(localStorage.getItem('multimeet.settings') ?? '{}'),
  }));
  const [pinned, setPinned] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const compositeSources = useMemo(
    () =>
      participants
        .filter((p) => p.role !== 'output')
        .map((participant): CompositeSource => ({
          id: participant.id,
          displayName: participant.displayName,
          stream:
            participant.role === 'host'
              ? localRef.current!
              : (streamsRef.current.get(participant.id) ?? new MediaStream()),
          cameraEnabled: participant.cameraEnabled,
        })),
    [participants],
  );

  useEffect(() => {
    compositorRef.current?.applySettings(settings);
    localStorage.setItem('multimeet.settings', JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    compositorRef.current?.setSources(compositeSources);
  }, [compositeSources]);
  useEffect(
    () => () => {
      peerRef.current?.close();
      compositorRef.current?.stop();
      void mixerRef.current?.close();
      stopStream(localRef.current);
      streamsRef.current.forEach(stopStream);
    },
    [],
  );

  async function create({
    displayName,
    password,
    stream,
  }: {
    displayName: string;
    password: string;
    stream: MediaStream;
  }) {
    setCreating(true);
    setError('');
    const created = await api.createRoom({ hostName: displayName, password, maxParticipants: 6 });
    localRef.current = stream;
    setRoom(created);
    const compositor = new VideoCompositor(settings, canvasRef.current!);
    compositorRef.current = compositor;
    compositor.start();
    const mixer = new AudioMixer();
    mixerRef.current = mixer;
    mixer.add('host', stream);
    const composite = new MediaStream([
      ...compositor.stream.getVideoTracks(),
      ...mixer.stream.getAudioTracks(),
    ]);
    const socketToken = created.hostToken.slice(created.hostToken.indexOf('.') + 1);
    const peer = new MeetingPeer(socketToken, created.config, stream, 'host', {
      onRoomState: (next) => {
        if (next.id) {
          setState(next);
          setParticipants((current) => {
            const byId = new Map(current.map((p) => [p.id, p]));
            return next.participants
              .filter((p) => p.role !== 'output')
              .map((p) => ({ ...byId.get(p.id), ...p }));
          });
        }
        for (const output of next.participants.filter((p) => p.role === 'output'))
          void peer.sendCompositeToOutput(output.id, composite);
      },
      onStream: (id, remote) => {
        streamsRef.current.set(id, remote);
        mixer.add(id, remote, volumes[id] ?? 1);
        setParticipants((value) => [...value]);
      },
      onParticipantLeft: (id) => {
        streamsRef.current.delete(id);
        mixer.remove(id);
        setParticipants((value) => value.filter((p) => p.id !== id));
      },
      onError: setError,
      onEnded: () => {
        setError('Roomが終了しました。');
        cleanup();
      },
    });
    peerRef.current = peer;
    const initial = await peer.join();
    setState(initial);
    setParticipants(initial.participants.filter((p) => p.role !== 'output'));
    setCreating(false);
  }

  function cleanup() {
    peerRef.current?.close();
    compositorRef.current?.stop();
    void mixerRef.current?.close();
    stopStream(localRef.current);
    setRoom(undefined);
    setState(undefined);
    setParticipants([]);
  }

  async function endRoom() {
    if (!room) return;
    await api.endRoom(room.roomId, room.hostToken);
    cleanup();
  }
  function toggleTrack(kind: 'audio' | 'video') {
    const track =
      kind === 'audio'
        ? localRef.current?.getAudioTracks()[0]
        : localRef.current?.getVideoTracks()[0];
    if (!track || !peerRef.current) return;
    track.enabled = !track.enabled;
    const nextMic = kind === 'audio' ? track.enabled : micOn;
    const nextCamera = kind === 'video' ? track.enabled : cameraOn;
    setMicOn(nextMic);
    setCameraOn(nextCamera);
    peerRef.current.socket.emit('media-state', {
      microphoneEnabled: nextMic,
      cameraEnabled: nextCamera,
      screenSharing: false,
    });
  }
  async function shareScreen() {
    const stream = localRef.current;
    if (!stream || !navigator.mediaDevices.getDisplayMedia || sharing) return;
    const camera = stream.getVideoTracks()[0];
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = display.getVideoTracks()[0];
    if (!track) return;
    if (camera) stream.removeTrack(camera);
    stream.addTrack(track);
    peerRef.current?.replaceTrack('video', track);
    setSharing(true);
    setParticipants((current) => [...current]);
    peerRef.current?.socket.emit('media-state', {
      microphoneEnabled: micOn,
      cameraEnabled: true,
      screenSharing: true,
    });
    track.onended = () => {
      stream.removeTrack(track);
      track.stop();
      if (camera?.readyState === 'live') {
        stream.addTrack(camera);
        peerRef.current?.replaceTrack('video', camera);
      }
      setSharing(false);
      setParticipants((current) => [...current]);
      peerRef.current?.socket.emit('media-state', {
        microphoneEnabled: micOn,
        cameraEnabled: cameraOn,
        screenSharing: false,
      });
    };
  }
  async function outputUrl() {
    if (!room) return;
    const { token } = await api.outputToken(room.roomId, room.hostToken);
    await navigator.clipboard.writeText(
      `${location.origin}/output?token=${encodeURIComponent(token)}`,
    );
  }

  if (!room)
    return (
      <main className="setup-page">
        <DeviceSetup busy={creating} submitLabel="Roomを作成" onSubmit={create} requestPassword />
        {error && <div className="toast error">{error}</div>}
      </main>
    );

  return (
    <main className="dashboard">
      <header>
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MultiMeet</span>
        </div>
        <div className="room-pill">
          <i /> LIVE · {room.roomId}
        </div>
        <span className="header-count">
          {state?.participants.filter((p) => p.role !== 'output').length ?? 1} /{' '}
          {state?.maxParticipants ?? 6}
        </span>
      </header>
      <section className="preview-panel">
        <div className="panel-title">
          <div>
            <span>OUTPUT PREVIEW</span>
            <strong>OmeTVへ出力される最終映像</strong>
          </div>
          <div>
            {settings.outputSize === '720p' ? '1280 × 720' : '1920 × 1080'} · {settings.fps} FPS
          </div>
        </div>
        <div className="canvas-wrap">
          <canvas
            ref={canvasRef}
            onDoubleClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const index = Math.floor(
                ((event.clientX - rect.left) / rect.width) * Math.min(participants.length, 3),
              );
              const source = compositeSources[index];
              if (source) compositorRef.current?.toggleSolo(source.id);
            }}
          />
        </div>
        <div className="control-bar">
          <button className={micOn ? '' : 'off'} onClick={() => toggleTrack('audio')}>
            {micOn ? <Mic /> : <MicOff />}
            <span>Mic</span>
          </button>
          <button className={cameraOn ? '' : 'off'} onClick={() => toggleTrack('video')}>
            {cameraOn ? <Camera /> : <CameraOff />}
            <span>Camera</span>
          </button>
          <button className={sharing ? 'active' : ''} onClick={() => void shareScreen()}>
            <MonitorUp />
            <span>Share</span>
          </button>
          <button
            onClick={() => setSettings((value) => ({ ...value, showNames: !value.showNames }))}
          >
            <Image />
            <span>Names</span>
          </button>
          <button
            onClick={() =>
              setSettings((value) => ({
                ...value,
                outputSize: value.outputSize === '720p' ? '1080p' : '720p',
              }))
            }
          >
            <Settings />
            <span>Settings</span>
          </button>
          <button onClick={() => void navigator.clipboard.writeText(room.inviteUrl)}>
            <Copy />
            <span>Invite</span>
          </button>
          <button onClick={() => void outputUrl()}>
            <MonitorUp />
            <span>OBS URL</span>
          </button>
          <button className="end" onClick={() => void endRoom()}>
            <LogOut />
            <span>End Room</span>
          </button>
        </div>
      </section>
      <aside className="participants-panel">
        <div className="participants-heading">
          <div>
            <span>PARTICIPANTS</span>
            <strong>{participants.length} people</strong>
          </div>
          <button onClick={() => void navigator.clipboard.writeText(room.inviteUrl)}>
            <UserPlus size={17} /> Invite
          </button>
        </div>
        <div className="participant-list">
          {participants.map((participant) => (
            <ParticipantCard
              key={participant.id}
              participant={participant}
              volume={volumes[participant.id] ?? 1}
              pinned={pinned === participant.id}
              onVolume={(value) => {
                setVolumes((current) => ({ ...current, [participant.id]: value }));
                mixerRef.current?.setVolume(participant.id, value);
              }}
              onMute={() =>
                peerRef.current?.socket.emit('admin-action', {
                  type: 'mute',
                  target: participant.id,
                })
              }
              onKick={() =>
                peerRef.current?.socket.emit('admin-action', {
                  type: 'kick',
                  target: participant.id,
                })
              }
              onPin={() => {
                setPinned((current) => (current === participant.id ? null : participant.id));
                compositorRef.current?.setPinned(participant.id);
              }}
              onDragStart={() => {
                draggedRef.current = participant.id;
              }}
              onDrop={() => {
                if (!draggedRef.current) return;
                compositorRef.current?.reorder(draggedRef.current, participant.id);
                const order = compositorRef.current?.orderedIds() ?? [];
                setParticipants((current) =>
                  [...current].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
                );
              }}
            />
          ))}
        </div>
        <div className="settings-card">
          <span>BACKGROUND</span>
          <div className="swatches">
            {['#090b10', '#ffffff', '#444851', '#11213f'].map((color) => (
              <button
                key={color}
                style={{ background: color }}
                onClick={() => setSettings((value) => ({ ...value, background: color }))}
              />
            ))}
            <input
              type="color"
              value={settings.background}
              onChange={(event) =>
                setSettings((value) => ({ ...value, background: event.target.value }))
              }
            />
          </div>
          <label>
            Background image
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || file.size > 4_000_000)
                  return setError('Background画像は4MB以下にしてください。');
                const reader = new FileReader();
                reader.onload = () =>
                  setSettings((value) => ({ ...value, backgroundImage: String(reader.result) }));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <label>
            Frame rate
            <select
              value={settings.fps}
              onChange={(event) =>
                setSettings((value) => ({ ...value, fps: Number(event.target.value) as 30 | 60 }))
              }
            >
              <option value="30">30 FPS</option>
              <option value="60">60 FPS</option>
            </select>
          </label>
        </div>
      </aside>
      {error && <div className="toast error">{error}</div>}
    </main>
  );
}
