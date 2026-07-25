import { Nav } from './components/Nav';
import { useRoute } from './router';

export function App() {
  const { route } = useRoute();
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
      <Nav current={route} />
      <main style={{ maxWidth: 1320, margin: '0 auto', padding: 24 }}>
        Pantalla: {route}
      </main>
    </div>
  );
}
