import { useEffect, useState } from 'react';
import { HomePage } from './pages/HomePage';
import { HostPage } from './pages/HostPage';
import { JoinPage } from './pages/JoinPage';
import { OutputPage } from './pages/OutputPage';

export function App() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener('popstate', update);
    return () => removeEventListener('popstate', update);
  }, []);
  if (path === '/host') return <HostPage />;
  if (path === '/output') return <OutputPage />;
  const join = path.match(/^\/join\/([A-Z2-9]{6})$/i);
  if (join?.[1]) return <JoinPage roomId={join[1].toUpperCase()} />;
  return <HomePage />;
}
