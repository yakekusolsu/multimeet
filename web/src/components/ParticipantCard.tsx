import { GripVertical, Mic, MicOff, Pin, UserMinus, Video, VideoOff } from '../icons';
import type { ParticipantSummary } from '@multimeet/shared';

interface Props {
  participant: ParticipantSummary;
  volume: number;
  pinned: boolean;
  onVolume: (value: number) => void;
  onMute: () => void;
  onKick: () => void;
  onPin: () => void;
  onDragStart: () => void;
  onDrop: () => void;
}

export function ParticipantCard({
  participant,
  volume,
  pinned,
  onVolume,
  onMute,
  onKick,
  onPin,
  onDragStart,
  onDrop,
}: Props) {
  return (
    <article
      className="participant-card"
      draggable
      onDragStart={onDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <GripVertical size={17} className="grip" />
      <div className="avatar">{participant.displayName.slice(0, 1).toUpperCase()}</div>
      <div className="participant-info">
        <strong>{participant.displayName}</strong>
        <span className={`status ${participant.connectionState}`}>
          {participant.connectionState} · {participant.ping ?? '—'}ms
        </span>
      </div>
      <span title={participant.microphoneEnabled ? 'Mic ON' : 'Mic OFF'}>
        {participant.microphoneEnabled ? <Mic size={16} /> : <MicOff size={16} />}
      </span>
      <span title={participant.cameraEnabled ? 'Camera ON' : 'Camera OFF'}>
        {participant.cameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
      </span>
      <button className={pinned ? 'icon active' : 'icon'} title="Pin" onClick={onPin}>
        <Pin size={16} />
      </button>
      {participant.role !== 'host' && (
        <>
          <button className="icon" title="強制Mute" onClick={onMute}>
            <MicOff size={16} />
          </button>
          <button className="icon danger" title="強制退出" onClick={onKick}>
            <UserMinus size={16} />
          </button>
        </>
      )}
      <label className="volume">
        {Math.round(volume * 100)}%
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
        />
      </label>
    </article>
  );
}
