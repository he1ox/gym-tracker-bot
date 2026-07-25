import { useMemo } from 'react';
import { Nav } from './components/Nav';
import { buildDataset } from './data/mock';
import { buildOverview } from './presenters/overview';
import { buildRoutines } from './presenters/routines';
import { buildSessions } from './presenters/sessions';
import { useRoute } from './router';
import { Overview } from './screens/Overview';
import { Routines } from './screens/Routines';
import { Sessions } from './screens/Sessions';

export function App() {
  const { route } = useRoute();
  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => buildDataset(now), [now]);
  const overview = useMemo(() => buildOverview(data, now), [data, now]);
  const sessions = useMemo(() => buildSessions(data), [data]);
  const routines = useMemo(() => buildRoutines(data), [data]);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {route === 'overview' && <Overview model={overview} />}
        {route === 'sessions' && <Sessions model={sessions} />}
        {route === 'routines' && <Routines model={routines} />}
        {route === 'exercise' && <p>Pantalla: ejercicio</p>}
      </main>
    </div>
  );
}
