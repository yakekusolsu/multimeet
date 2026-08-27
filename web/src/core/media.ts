export interface DeviceLists {
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
}

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export async function getLocalMedia(
  cameraId?: string,
  microphoneId?: string,
): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('このBrowserはカメラ・マイクに対応していません。');
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: cameraId
        ? { deviceId: { exact: cameraId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: microphoneId
        ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: microphoneId } }
        : AUDIO_CONSTRAINTS,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotAllowedError')
      throw new Error('カメラまたはマイクの権限が拒否されました。Browser設定を確認してください。');
    if (error instanceof DOMException && error.name === 'NotFoundError')
      throw new Error('利用できるカメラまたはマイクが見つかりません。');
    throw error;
  }
}

export async function enumerateMediaDevices(): Promise<DeviceLists> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((device) => device.kind === 'videoinput'),
    microphones: devices.filter((device) => device.kind === 'audioinput'),
  };
}

export async function replaceDeviceTrack(
  stream: MediaStream,
  kind: 'video' | 'audio',
  deviceId?: string,
): Promise<MediaStreamTrack> {
  const fresh = await navigator.mediaDevices.getUserMedia(
    kind === 'video'
      ? { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' } }
      : {
          audio: deviceId
            ? { ...AUDIO_CONSTRAINTS, deviceId: { exact: deviceId } }
            : AUDIO_CONSTRAINTS,
        },
  );
  const track = kind === 'video' ? fresh.getVideoTracks()[0] : fresh.getAudioTracks()[0];
  if (!track) throw new Error(`${kind === 'video' ? 'カメラ' : 'マイク'}Trackを取得できません。`);
  const old = kind === 'video' ? stream.getVideoTracks()[0] : stream.getAudioTracks()[0];
  if (old) {
    stream.removeTrack(old);
    old.stop();
  }
  stream.addTrack(track);
  return track;
}

export function stopStream(stream?: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
