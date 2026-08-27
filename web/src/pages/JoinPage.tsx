import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, LogOut, Mic, MicOff, MonitorUp, SwitchCamera } from '../icons';
import type { RoomState } from '@multimeet/shared';
import { api } from '../core/api';
import { getLocalMedia, replaceDeviceTrack, stopStream } from '../core/media';
import { MeetingPeer } from '../core/peer';
import { DeviceSetup } from '../components/DeviceSetup';

export function JoinPage({ roomId }: { roomId: string }) {
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const localStream = useRef<MediaStream>();
  const peer = useRef<MeetingPeer>();
  const cameraId = useRef('');
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<RoomState>();
  const [error, setError] = useState('');
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const guestToken = new URLSearchParams(location.search).get('t') ?? '';

  useEffect(
    () => () => {
      peer.current?.close();
      stopStream(localStream.current);
    },
    [],
  );

  async function join(value: {
    displayName: string;
    password: string;
    stream: MediaStream;
    cameraId: string;
  }) {
    const admission = await api.admission(roomId, {
      displayName: value.displayName,
      password: value.password,
      guestToken,
    });
    localStream.current = value.stream;
    cameraId.current = value.cameraId;
    const meeting = new MeetingPeer(admission.token, admission.config, value.stream, 'guest', {
      onRoomState: setState,
      onStream: (_id, stream) => {
        if (remoteVideo.current) {
          remoteVideo.current.srcObject = stream;
          void remoteVideo.current.play();
        }
      },
      onAdminAction: (action) => {
        if (action.type === 'mute') {
          const track = localStream.current?.getAudioTracks()[0];
          if (track) {
            track.enabled = false;
            setMicOn(false);
          }
        }
        if (action.type === 'kick') {
          setError('Hostにより退出しました。');
          leave();
        }
      },
      onError: setError,
      onEnded: () => {
        setError('HostがRoomを終了しました。');
        leave();
      },
    });
    peer.current = meeting;
    setState(await meeting.join());
    setJoined(true);
    requestAnimationFrame(() => {
      if (localVideo.current) {
        localVideo.current.srcObject = value.stream;
        void localVideo.current.play();
      }
    });
  }

  function emitState(nextCamera = cameraOn, nextMic = micOn, nextSharing = sharing) {
    peer.current?.socket.emit('media-state', {
      cameraEnabled: nextCamera,
      microphoneEnabled: nextMic,
      screenSharing: nextSharing,
    });
  }
  function toggle(kind: 'video' | 'audio') {
    const track =
      kind === 'video'
        ? localStream.current?.getVideoTracks()[0]
        : localStream.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    if (kind === 'video') {
      setCameraOn(track.enabled);
      emitState(track.enabled, micOn, sharing);
    } else {
      setMicOn(track.enabled);
      emitState(cameraOn, track.enabled, sharing);
    }
  }
  async function flipCamera() {
    if (!localStream.current) return;
    const track = await replaceDeviceTrack(localStream.current, 'video');
    peer.current?.replaceTrack('video', track);
    cameraId.current = track.getSettings().deviceId ?? '';
    if (localVideo.current) localVideo.current.srcObject = localStream.current;
  }
  async function shareScreen() {
    if (!navigator.mediaDevices.getDisplayMedia || !localStream.current) return;
    const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    const track = display.getVideoTracks()[0];
    if (!track) return;
    peer.current?.replaceTrack('video', track);
    setSharing(true);
    emitState(cameraOn, micOn, true);
    track.onended = () => {
      const camera = localStream.current?.getVideoTracks()[0];
      if (camera) peer.current?.replaceTrack('video', camera);
      setSharing(false);
      emitState(cameraOn, micOn, false);
    };
  }
  function leave() {
    peer.current?.close();
    stopStream(localStream.current);
    setJoined(false);
  }

  if (!joined)
    return (
      <main className="setup-page">
        <DeviceSetup submitLabel="Roomに参加" onSubmit={join} requestPassword />
        {error && <div className="toast error">{error}</div>}
      </main>
    );
  return (
    <main className="guest-page">
      <header>
        <div className="brand">
          <span className="brand-mark">M</span>MultiMeet
        </div>
        <div className="room-pill">
          <i /> {roomId}
        </div>
      </header>
      <section className="guest-stage">
        <video ref={remoteVideo} autoPlay playsInline className="remote-video" />
        <div className="local-float">
          <video ref={localVideo} autoPlay muted playsInline />
        </div>
        <div className="guest-count">
          {state?.participants.filter((p) => p.role !== 'output').length ?? 1} /{' '}
          {state?.maxParticipants ?? 6} joined
        </div>
      </section>
      <nav className="guest-controls">
        <button className={micOn ? '' : 'off'} onClick={() => toggle('audio')}>
          {micOn ? <Mic /> : <MicOff />}
        </button>
        <button className={cameraOn ? '' : 'off'} onClick={() => toggle('video')}>
          {cameraOn ? <Camera /> : <CameraOff />}
        </button>
        <button onClick={() => void flipCamera()}>
          <SwitchCamera />
        </button>
        {'getDisplayMedia' in navigator.mediaDevices && (
          <button onClick={() => void shareScreen()} className={sharing ? 'active' : ''}>
            <MonitorUp />
          </button>
        )}
        <button className="end" onClick={leave}>
          <LogOut />
        </button>
      </nav>
      {error && <div className="toast error">{error}</div>}
    </main>
  );
}
