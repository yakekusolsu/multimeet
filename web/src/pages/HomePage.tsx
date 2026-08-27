import { Link } from '../router';

export function HomePage() {
  return (
    <main className="landing">
      <div className="hero">
        <div className="brand">
          <span className="brand-mark">M</span>
          <span>MultiMeet</span>
        </div>
        <span className="eyebrow">UP TO 6 PEOPLE · P2P</span>
        <h1>
          みんなの映像を、
          <br />
          <em>ひとつのカメラへ。</em>
        </h1>
        <p>友達はURLを開くだけ。映像と音声をBrowser上で合成し、配信やビデオチャットへ届けます。</p>
        <div className="hero-actions">
          <Link href="/host" className="primary large">
            Roomを作成
          </Link>
          <a className="secondary large" href="https://github.com" target="_blank" rel="noreferrer">
            導入ガイド
          </a>
        </div>
        <div className="privacy-note">🔒 映像・音声はP2P通信され、サーバーには保存されません。</div>
      </div>
    </main>
  );
}
