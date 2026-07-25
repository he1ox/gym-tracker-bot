import { useMemo } from 'react';
import { Nav } from './components/Nav';
import { buildDataset } from './data/mock';
import { buildExercise, firstExerciseId } from './presenters/exercise';
import { buildOverview } from './presenters/overview';
import { buildRoutines } from './presenters/routines';
import { buildSessions } from './presenters/sessions';
import { useRoute } from './router';
import { ExerciseDetail } from './screens/ExerciseDetail';
import { Overview } from './screens/Overview';
import { Routines } from './screens/Routines';
import { Sessions } from './screens/Sessions';

export function App() {
  const { route, exerciseId } = useRoute();
  const now = useMemo(() => new Date(), []);
  const data = useMemo(() => buildDataset(now), [now]);
  const overview = useMemo(() => buildOverview(data, now), [data, now]);
  const sessions = useMemo(() => buildSessions(data), [data]);
  const routines = useMemo(() => buildRoutines(data), [data]);
  const targetId = exerciseId ?? firstExerciseId(data);
  const exercise = useMemo(
    () => (targetId === undefined ? undefined : buildExercise(data, targetId)),
    [data, targetId],
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        {route === 'overview' && <Overview model={overview} />}
        {route === 'sessions' && <Sessions model={sessions} />}
        {route === 'routines' && <Routines model={routines} />}
        {route === 'exercise' && (
          exercise === undefined
            ? <p className="text-muted">Ejercicio no encontrado.</p>
            : <ExerciseDetail model={exercise} />
        )}
      </main>
    </div>
  );
}
