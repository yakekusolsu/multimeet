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
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play();
          }
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
