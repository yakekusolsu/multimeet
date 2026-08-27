import { useEffect, useRef, useState } from 'react';
import { Camera, Mic, Video } from '../icons';
import { enumerateMediaDevices, getLocalMedia, stopStream, type DeviceLists } from '../core/media';

interface Props {
  busy?: boolean;
  submitLabel: string;
  onSubmit: (value: {
    displayName: string;
    password: string;
    stream: MediaStream;
    cameraId: string;
    microphoneId: string;
  }) => Promise<void>;
  requestPassword?: boolean;
}

export function DeviceSetup({ busy, submitLabel, onSubmit, requestPassword }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<DeviceLists>({ cameras: [], microphones: [] });
  const [cameraId, setCameraId] = useState('');
  const [microphoneId, setMicrophoneId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function preview(nextCamera = cameraId, nextMicrophone = microphoneId) {
    try {
      setError('');
      const next = await getLocalMedia(nextCamera || undefined, nextMicrophone || undefined);
      stopStream(stream);
      setStream(next);
      if (videoRef.current) {
        videoRef.current.srcObject = next;
        await videoRef.current.play();
      }
      const listed = await enumerateMediaDevices();
      setDevices(listed);
      setCameraId(next.getVideoTracks()[0]?.getSettings().deviceId ?? nextCamera);
      setMicrophoneId(next.getAudioTracks()[0]?.getSettings().deviceId ?? nextMicrophone);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Previewを開始できません。');
    }
  }

  useEffect(() => {
    void preview();
    return () => stopStream(stream);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <form
      className="setup-card"
      onSubmit={(event) => {
        event.preventDefault();
        if (!stream) return setError('先にカメラPreviewを開始してください。');
        void onSubmit({ displayName, password, stream, cameraId, microphoneId }).catch((reason) =>
          setError(reason instanceof Error ? reason.message : '参加できませんでした。'),
        );
      }}
    >
      <div className="brand">
        <span className="brand-mark">M</span>
        <span>MultiMeet</span>
      </div>
      <h1>カメラとマイクを確認</h1>
      <p className="muted">参加前に映像と使用Deviceを確認してください。</p>
      <div className="setup-preview">
        <video ref={videoRef} muted playsInline />
      </div>
      <label>
        表示名
        <input
          value={displayName}
          maxLength={32}
          required
          placeholder="あなたの名前"
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </label>
      {requestPassword && (
        <label>
          Room Password
          <input
            value={password}
            type="password"
            maxLength={128}
            placeholder="設定されている場合"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      <div className="device-row">
        <label>
          <span>
            <Camera size={16} /> カメラ
          </span>
          <select
            value={cameraId}
            onChange={(event) => {
              setCameraId(event.target.value);
              void preview(event.target.value, microphoneId);
            }}
          >
            {devices.cameras.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>
            <Mic size={16} /> マイク
          </span>
          <select
            value={microphoneId}
            onChange={(event) => {
              setMicrophoneId(event.target.value);
              void preview(cameraId, event.target.value);
            }}
          >
            {devices.microphones.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      <button className="primary large" disabled={busy || !stream || !displayName.trim()}>
        <Video size={18} />
        {busy ? '接続中…' : submitLabel}
      </button>
    </form>
  );
}
