# MultiMeet for OmeTV

最大6人のカメラ・マイクをP2P WebRTCでHostへ送り、Canvas映像とWeb Audio音声を1本の`MediaStream`へ合成するManifest V3 Chrome拡張＋Webアプリです。Guestは拡張機能不要で、招待URLをスマートフォンまたはPCのBrowserで開くだけです。

> 映像・音声はサーバーへ送信・保存しません。シグナリングサーバーは接続情報だけを中継します。録画機能はありません。

## 必要環境

- Node.js 20以上（推奨22 LTS）とnpm
- Chrome / Edge / Brave 120以上
- Guest: iPhone Safari、Android Chrome、Windows/macOS Chromeの現行版
- Camera/Microphone利用には`localhost`またはHTTPSが必要
- 公開運用ではTLS、推測困難な`TOKEN_SECRET`、必要に応じてTURNサーバー

## InstallとBuild

```bash
cd multimeet
cp .env.example .env
npm install
npm run build
npm test
```

開発時は次でServer、Web、Extension Watchを起動します。

```bash
npm run dev
```

Web UIは`http://localhost:5173`、API/Socket.IOは`http://localhost:3000`です。本番Build後、Serverは`web/dist`も配信します。

## Docker

`.env`の`TOKEN_SECRET`を必ず変更してから起動します。

```bash
docker compose up -d
```

停止は`docker compose down`です。映像・音声データを保存するVolumeはありません。

## Chrome拡張の導入（Developer Mode）

1. `npm run build`を実行する
2. Chromeで`chrome://extensions`を開く
3. 右上の「Developer mode」をONにする
4. 「Load unpacked」を押す
5. `multimeet/extension/dist`を選ぶ
6. MultiMeetをToolbarへPinする

Edgeは`edge://extensions`、Braveは`brave://extensions`で同様です。`extension/dist`には秘密情報を含めないでください。

## Room作成と招待

### OmeTVで使う場合

1. Serverを起動し、OmeTVタブを開く
2. 拡張PopupでServer URL、表示名、任意のPassword、最大人数を設定する
3. 「Roomを作成」を押し、Camera/Microphoneを許可する
4. 招待URLをコピーして友達へ送る
5. OmeTVがすでにCamera送信中なら、一度CameraをOFF/ONして再取得させる

ProviderはOmeTVページの標準`getUserMedia`と、拡張起動前に作られた既存の`RTCRtpSender`だけを合成Trackへ接続します。Room終了時は元のTrackへ戻します。通常のCamera APIへフォールバックするため、Room未使用時のCamera選択は変更しません。

これはOSレベルの仮想Camera Driverを登録する実装ではありません。OmeTVのDOMやBAN判定を操作・回避せず、MediaStream/WebRTC APIの境界だけを利用します。OmeTV側の実装変更で再接続が必要になったり、動作しなくなったりする可能性があります。

### Web Host画面を使う場合

`http://localhost:3000/host`（開発時は`http://localhost:5173/host`）を開きます。Preview、個別Volume、Mute、Kick、Drag & Drop、Pin、Double-click Solo、Background、30/60 FPS、720p/1080pを操作できます。

## Guest参加

1. 招待URL `/join/ROOMID?t=GUEST_TOKEN` を開く
2. 表示名とPasswordを入力する
3. Camera/Microphoneを選択し、Previewを確認する
4. 「Roomに参加」を押す

参加後もCamera/Mic ON/OFF、Device切替、Front/Back Camera切替、対応PC BrowserでScreen Shareを利用できます。iOSではSafariの権限設定とHTTPSが必要です。

## OBS Browser Source

Web Host画面で「OBS URL」を押すと、1時間有効のOutput Token付きURLがClipboardへコピーされます。

1. OBSで「Browser」をSourceとして追加する
2. コピーした`https://your-host/output?token=...`をURLへ貼る
3. Width/Heightを1280×720または1920×1080に合わせる
4. 必要なら「Control audio via OBS」をONにする

`/output`にはControl UIが一切表示されず、HostからP2Pで受けた合成映像だけを表示します。Tokenを配信画面やLogへ公開しないでください。

## STUN / TURN設定

Serverの`.env`だけで設定します。TURN CredentialをExtensionのChrome StorageやSourceへ直書きしません。

```env
STUN_URL=stun:stun.l.google.com:19302
TURN_URL=turns:turn.example.com:5349
TURN_USERNAME=temporary-user
TURN_PASSWORD=temporary-password
```

公開運用ではcoturn等の時間制限付きCredentialを推奨します。企業Network、Mobile Network、Symmetric NATではTURNがないとP2P接続できない場合があります。

## Security

- Room IDは紛らわしい文字を除いた暗号学的Random 6文字
- Room Passwordはscrypt＋Random SaltでHash化し、平文保存しない
- Host/Guest/OBSごとの署名Tokenと有効期限
- 管理操作はHost Roleだけに許可し、対象Room内SocketだけへRelay
- API Rate Limit、16KB JSON上限、Helmet、Origin Allowlist
- Room ID検証、表示名Sanitize、ReactのDefault EscapeによるXSS対策
- Host切断後10秒だけ再接続を待ち、その後RoomとTokenを破棄
- TURN秘密情報と`TOKEN_SECRET`は`.env`のみ。`.env`はGit対象外

公開時は`ALLOWED_ORIGINS`を実際のWeb Hostと`https://ome.tv`だけへ限定し、Reverse ProxyでHTTPS/WSSを終端してください。URLに含まれるGuest/OBS TokenはSecretとして扱います。State-changing APIはJSON＋Bearer Token＋Origin制限を使い、Cookie認証を使わないためCross-site Cookie型CSRFを避けています。

## Privacy

Camera/Microphone/ScreenのMedia TrackはGuestとHost間（OBSはHostとOBS間）で直接送られます。ServerはSDP/ICE、参加表示名、Media ON/OFF状態をMemory上で中継するだけです。Database、Object Storage、Recording処理はありません。Room終了またはServer再起動でRoom情報は消えます。

## Troubleshooting

- **Camera/Mic権限拒否**: Address barのSite設定で許可し、Pageを再読込する。
- **Deviceが見つからない**: 他Appを閉じ、OS Privacy設定とCableを確認する。
- **Roomなし/満員/Password違い**: 新しい招待URLをHostから取得し、最大6人（Host含む）を確認する。
- **WebSocket切断**: `PUBLIC_URL`、Reverse ProxyのWebSocket Upgrade、Firewallを確認する。Clientは1/2/5/10秒相当で最大4回再接続する。
- **WebRTC接続失敗**: TURNを設定し、`chrome://webrtc-internals`でICE Candidateを確認する。
- **映像がOmeTVへ反映されない**: 拡張をOmeTV読込前から有効にし、Room作成後にOmeTVのCameraをOFF/ONする。
- **Echo**: Headphoneを使う。Host MicはMixerへ1回だけ入り、Preview VideoはMute済み。
- **OBSが黒い**: Host Roomが有効か、Output Tokenの1時間期限、OBSのBrowser Hardware Accelerationを確認する。
- **Host切断**: 10秒以内なら自動再接続。それを超えるとGuestへRoom終了を通知する。

Development Logは`[MultiMeet]`Prefixを使います。Production Bundleでは不要なDebug Logを出しません。

## 開発者向け構成

```text
multimeet/
├── extension/              # MV3 Popup / Content bridge / OmeTV MAIN-world Provider
│   └── src/
│       ├── background/
│       ├── content/
│       ├── popup/
│       └── providers/ometv/
├── server/                 # Express + Socket.IO、認証、Room memory store
├── web/                    # React Host / Join / Output
│   └── src/core/           # Media、WebRTC、Canvas compositor、Audio mixer
├── shared/                 # 共通型、入力検証、1〜6人Layout
├── docker-compose.yml
└── .env.example
```

`providers/ometv`以外のCoreはOmeTVへ依存しません。将来は同じProvider境界でChatrouletteやEmerald Chatを追加できます。PeerConnection、Track、AudioContext、AnimationFrame、Stats Timerは退出時に明示的にClose/Stopします。

## テスト

```bash
npm test
npm run typecheck
npm run build
```

VitestでRoom作成/終了、Password、Guest参加/退出/再接続、2/4/6人、Camera/Mic OFF、1〜6人Layout、Pin Layoutを検証します。Cameraの実機PermissionとOmeTV連携はChromeで手動E2E確認してください。
