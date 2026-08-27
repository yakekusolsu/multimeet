# Implementation phase report

## Phase 1

- 実装: MV3基盤、Room API、Guest Device Preview、Host/Guest 1対1 WebRTC、Camera/Mic通信
- 主なFile: `server/src/app.ts`, `server/src/socket.ts`, `web/src/pages/JoinPage.tsx`, `web/src/core/peer.ts`
- Test: Room APIとSocket join
- 残件: 複数人合成

## Phase 2

- 実装: 最大6人、1〜6人自動Layout、Canvas captureStream、Web Audio Mixer、720p/1080p・30/60 FPS
- 主なFile: `shared/src/layout.ts`, `web/src/core/compositor.ts`, `web/src/core/audioMixer.ts`
- Test: 1〜6人Layout、2/4/6 Socket接続
- 残件: 管理操作

## Phase 3

- 実装: 個別Volume 0〜200%、強制Mute/Kick、Drag & Drop、Pin、Double-click Solo、Camera OFF Avatar
- 主なFile: `web/src/pages/HostPage.tsx`, `web/src/components/ParticipantCard.tsx`, `extension/src/popup/main.tsx`
- Test: Media stateと退出
- 残件: OBS、Screen Share、Network状態

## Phase 4

- 実装: 無UI OBS Output、Guest/Host Screen Share、Socket自動再接続、Ping、getStatsによるBitrate/FPS低下
- 主なFile: `web/src/pages/OutputPage.tsx`, `web/src/core/peer.ts`
- Test: Guest reconnect
- 残件: OmeTV Providerと仕上げ

## Phase 5

- 実装: MAIN-world OmeTV Provider、既存Sender切替、Token/Password/Rate Limit/Origin対策、Dark responsive UI、Docker、README
- 主なFile: `extension/src/providers/ometv/index.ts`, `extension/public/manifest.json`, `Dockerfile`, `README.md`
- Test: 全Vitest、strict TypeScript、全Workspace Production Build
- 既知の制約: OS仮想Camera DriverではないためOmeTVの内部実装変更に影響される。実機Media PermissionとOmeTV本番は手動確認が必要。
