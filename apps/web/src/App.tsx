import { useMemo } from 'react';
import { Nav } from './components/Nav';
import { buildDataset } from './data/mock';
import { buildOverview } from './presenters/overview';
import { useRoute } from './router';
import { Overview } from './screens/Overview';

export function App() {
  const { route } = useRoute();
  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => buildDataset(now), [now]);
  const overview = useMemo(() => buildOverview(data, now), [data, now]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {route === 'overview' ? <Overview model={overview} /> : <p>Pantalla: {route}</p>}
      </main>
    </div>
  );
}
