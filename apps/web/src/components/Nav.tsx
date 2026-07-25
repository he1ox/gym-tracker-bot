import type { Route } from '../router';

const LINKS: ReadonlyArray<{ route: Route; label: string; href: string }> = [
  { route: 'overview', label: 'Resumen', href: '#/overview' },
  { route: 'exercise', label: 'Ejercicio', href: '#/exercise' },
  { route: 'sessions', label: 'Sesiones', href: '#/sessions' },
  { route: 'routines', label: 'Rutinas', href: '#/routines' },
];

export function Nav({ current }: { current: Route }) {
  return (
    <nav
      className="nav"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 20,
        background: 'color-mix(in srgb, var(--color-bg) 92%, transparent)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 1px 0 var(--color-divider)',
        paddingInline: 24,
      }}
    >
      <span
        className="nav-brand"
        style={{ display: 'flex', alignItems: 'center', gap: 9, letterSpacing: '0.02em' }}
      >
        <span
          style={{
            display: 'inline-flex',
            width: 22,
            height: 22,
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--color-accent)',
            borderRadius: 5,
            color: 'var(--color-accent)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">
            <path d="M104,56v56h48V56a8,8,0,0,1,16,0V200a8,8,0,0,1-16,0V128H104v72a8,8,0,0,1-16,0V56a8,8,0,0,1,16,0Z" />
          </svg>
        </span>
        IRONLOG
      </span>
      {LINKS.map((link) => (
        <a
          key={link.route}
          href={link.href}
          {...(link.route === current ? { 'aria-current': 'page' as const } : {})}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
