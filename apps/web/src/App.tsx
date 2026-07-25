import { useMemo } from 'react';
import { Nav } from './components/Nav';
import { buildDataset } from './data/mock';
import { buildOverview } from './presenters/overview';
import { buildSessions } from './presenters/sessions';
import { useRoute } from './router';
import { Overview } from './screens/Overview';
import { Sessions } from './screens/Sessions';

export function App() {
  const { route } = useRoute();
  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => buildDataset(now), [now]);
  const overview = useMemo(() => buildOverview(data, now), [data, now]);
  const sessions = useMemo(() => buildSessions(data), [data]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {route === 'overview' && <Overview model={overview} />}
        {route === 'sessions' && <Sessions model={sessions} />}
        {route === 'routines' && <p>Pantalla: rutinas</p>}
        {route === 'exercise' && <p>Pantalla: ejercicio</p>}
      </main>
    </div>
  );
}
