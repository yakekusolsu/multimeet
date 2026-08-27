import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Camera,
  CameraOff,
  Copy,
  GripVertical,
  LogOut,
  Mic,
  MicOff,
  Pin,
  UserMinus,
  Users,
} from './icons';
import type { VisualSettings } from '@multimeet/shared';
import { DEFAULT_STATE, type ExtensionState, type ProviderCommand } from '../types';
import './popup.css';

interface SavedSettings extends VisualSettings {
  serverUrl: string;
  maxParticipants: number;
}
const DEFAULT_SETTINGS: SavedSettings = {
  serverUrl: 'http://localhost:3000',
  outputSize: '720p',
  fps: 30,
  background: '#090b10',
  showNames: true,
  maxParticipants: 6,
};

function Popup() {
  const [tabId, setTabId] = useState<number>();
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<ExtensionState>(DEFAULT_STATE);
  const [settings, setSettings] = useState<SavedSettings>(DEFAULT_SETTINGS);
  const [name, setName] = useState('Host');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const dragged = useRef<string>();

  useEffect(() => {
    void (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id);
      setSupported(Boolean(tab?.url && /^https:\/\/([^.]+\.)?ome\.tv\//i.test(tab.url)));
      if (tab?.id) {
        const current = (await chrome.tabs
          .sendMessage(tab.id, { type: 'get-state' })
          .catch(() => null)) as ExtensionState | null;
        if (current) setState(current);
      }
      const saved = await chrome.storage.local.get('multimeet.settings');
      if (saved['multimeet.settings'])
        setSettings({ ...DEFAULT_SETTINGS, ...(saved['multimeet.settings'] as SavedSettings) });
    })();
    const listener = (message: { type?: string; state?: ExtensionState }) => {
      if (message.type === 'multimeet-state' && message.state) setState(message.state);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  async function command(value: ProviderCommand) {
    if (!tabId) return;
    await chrome.tabs.sendMessage(tabId, { type: 'command', command: value });
  }
  async function create() {
    setBusy(true);
    await command({
      type: 'create',
      serverUrl: settings.serverUrl,
      hostName: name,
      password,
      maxParticipants: settings.maxParticipants,
      settings,
    });
    setBusy(false);
  }
  async function save(next: SavedSettings) {
    setSettings(next);
    await chrome.storage.local.set({ 'multimeet.settings': next });
    if (state.active) await command({ type: 'settings', settings: next });
  }

  if (!supported)
    return (
      <main className="popup unsupported">
        <div className="brand">
          <b>M</b> MultiMeet
        </div>
        <h2>OmeTVを開いてください</h2>
        <p>OmeTVのタブを選択した状態で、このPopupを開き直してください。</p>
        <a href="https://ome.tv/" target="_blank">
          OmeTVを開く
        </a>
      </main>
    );

  return (
    <main className="popup">
      <header>
        <div className="brand">
          <b>M</b> MultiMeet
        </div>
        {state.active && <span className="live">LIVE</span>}
      </header>
      {!state.active ? (
        <section className="create-form">
          <h1>Roomを作成</h1>
          <p>このOmeTVタブのカメラ出力をMultiMeetへ切り替えます。</p>
          <label>
            表示名
            <input value={name} maxLength={32} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Room Password
            <input
              value={password}
              type="password"
              maxLength={128}
              placeholder="任意"
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <div className="two">
            <label>
              最大人数
              <select
                value={settings.maxParticipants}
                onChange={(event) =>
                  void save({ ...settings, maxParticipants: Number(event.target.value) })
                }
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              出力
              <select
                value={settings.outputSize}
                onChange={(event) =>
                  void save({ ...settings, outputSize: event.target.value as '720p' | '1080p' })
                }
              >
                <option value="720p">1280×720</option>
                <option value="1080p">1920×1080</option>
              </select>
            </label>
          </div>
          <label>
            Server URL
            <input
              value={settings.serverUrl}
              onChange={(event) => setSettings({ ...settings, serverUrl: event.target.value })}
              onBlur={() => void save(settings)}
            />
          </label>
          <button className="primary" disabled={busy || !name.trim()} onClick={() => void create()}>
            {busy ? '作成中…' : 'Roomを作成'}
          </button>
        </section>
      ) : (
        <>
          <section className="room-summary">
            <div>
              <small>ROOM ID</small>
              <strong>{state.roomId}</strong>
            </div>
            <button onClick={() => void navigator.clipboard.writeText(state.inviteUrl ?? '')}>
              <Copy size={16} /> 招待URL
            </button>
          </section>
          <section className="output-action">
            <button
              onClick={() =>
                state.outputUrl
                  ? void navigator.clipboard.writeText(state.outputUrl)
                  : void command({ type: 'prepare-output' })
              }
            >
              <Copy size={15} />
              {state.outputUrl ? 'OBS URLをコピー' : 'OBS URLを作成'}
            </button>
          </section>
          <section className="quick-controls">
            <button
              className={state.microphoneEnabled ? '' : 'off'}
              onClick={() => void command({ type: 'toggle-microphone' })}
            >
              {state.microphoneEnabled ? <Mic /> : <MicOff />}
              <span>Mic</span>
            </button>
            <button
              className={state.cameraEnabled ? '' : 'off'}
              onClick={() => void command({ type: 'toggle-camera' })}
            >
              {state.cameraEnabled ? <Camera /> : <CameraOff />}
              <span>Camera</span>
            </button>
            <button onClick={() => void save({ ...settings, showNames: !settings.showNames })}>
              <Users />
              <span>Names</span>
            </button>
          </section>
          <section className="participants">
            <div className="section-title">
              <span>PARTICIPANTS</span>
              <b>
                {state.participants.length}/{settings.maxParticipants}
              </b>
            </div>
            {state.participants.map((participant) => (
              <article
                key={participant.id}
                draggable
                onDoubleClick={() =>
                  void command({ type: 'admin', action: 'solo', target: participant.id })
                }
                onDragStart={() => {
                  dragged.current = participant.id;
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragged.current)
                    void command({
                      type: 'reorder',
                      source: dragged.current,
                      target: participant.id,
                    });
                }}
              >
                <GripVertical size={15} />
                <i>{participant.displayName.slice(0, 1).toUpperCase()}</i>
                <div>
                  <strong>{participant.displayName}</strong>
                  <small>
                    {participant.connectionState} · {participant.ping ?? '—'}ms
                  </small>
                </div>
                {participant.role !== 'host' && (
                  <>
                    <button
                      title="Pin"
                      onClick={() =>
                        void command({ type: 'admin', action: 'pin', target: participant.id })
                      }
                    >
                      <Pin size={15} />
                    </button>
                    <button
                      title="Mute"
                      onClick={() =>
                        void command({ type: 'admin', action: 'mute', target: participant.id })
                      }
                    >
                      <MicOff size={15} />
                    </button>
                    <button
                      title="Kick"
                      onClick={() =>
                        void command({ type: 'admin', action: 'kick', target: participant.id })
                      }
                    >
                      <UserMinus size={15} />
                    </button>
                  </>
                )}
                {participant.role !== 'host' && (
                  <input
                    className="participant-volume"
                    title="Volume"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    defaultValue="1"
                    onChange={(event) =>
                      void command({
                        type: 'volume',
                        target: participant.id,
                        value: Number(event.target.value),
                      })
                    }
                  />
                )}
              </article>
            ))}
          </section>
          <section className="visual-settings">
            <label>
              背景
              <input
                type="color"
                value={settings.background}
                onChange={(event) => void save({ ...settings, background: event.target.value })}
              />
            </label>
            <label>
              FPS
              <select
                value={settings.fps}
                onChange={(event) =>
                  void save({ ...settings, fps: Number(event.target.value) as 30 | 60 })
                }
              >
                <option>30</option>
                <option>60</option>
              </select>
            </label>
          </section>
          <button className="end-room" onClick={() => void command({ type: 'end' })}>
            <LogOut size={17} /> Roomを終了
          </button>
        </>
      )}
      {state.error && <div className="error">{state.error}</div>}
      <footer>映像・音声は保存されません</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
