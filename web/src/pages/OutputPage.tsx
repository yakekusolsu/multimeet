import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api';
import { MeetingPeer } from '../core/peer';

export function OutputPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let meeting: MeetingPeer | undefined;
    void (async () => {
      const token = new URLSearchParams(location.search).get('token');
      if (!token)
        throw new Error('OBS Output Tokenがありません。Host画面からURLをコピーしてください。');
      const config = await api.config();
      meeting = new MeetingPeer(token, config, null, 'output', {
        onStream: (_id, stream) => {
          const video = videoRef.current;
          if (!video || video.srcObject === stream) return;
          video.srcObject = stream;
          video.muted = false;
          video.volume = 1;
          const play = () =>
            video.play().catch(async () => {
              // 通常BrowserのAutoplay制限時も映像だけは停止させない。OBSでは通常この分岐に入らない。
              video.muted = true;
              await video.play();
            });
          if (video.readyState >= HTMLMediaElement.HAVE_METADATA) void play();
          else video.onloadedmetadata = () => void play();
        },
        onError: setError,
        onEnded: () => setError('Room ended'),
      });
      await meeting.join();
    })().catch((reason) =>
      setError(reason instanceof Error ? reason.message : 'Outputを開始できません。'),
    );
    return () => meeting?.close();
  }, []);
  return (
    <main className="output-page">
      <video ref={videoRef} autoPlay playsInline />
      {error && <div className="output-error">{error}</div>}
    </main>
  );
}
