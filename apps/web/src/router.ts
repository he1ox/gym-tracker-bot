import { useEffect, useState } from 'react';

export type Route = 'overview' | 'sessions' | 'routines' | 'exercise';

export interface RouteState {
  route: Route;
  exerciseId?: number;
}

const ROUTES: readonly Route[] = ['overview', 'sessions', 'routines', 'exercise'];

function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

export function parseRoute(hash: string): RouteState {
  const segments = hash.replace(/^#\/?/, '').split('/').filter((s) => s.length > 0);
  const head = segments[0];
  if (head === undefined || !isRoute(head)) {
    return { route: 'overview' };
  }
  if (head !== 'exercise') {
    return { route: head };
  }
  const raw = segments[1];
  if (raw === undefined) {
    return { route: 'exercise' };
  }
  const id = Number.parseInt(raw, 10);
  // exactOptionalPropertyTypes: omit the key rather than assigning undefined.
  return Number.isInteger(id) ? { route: 'exercise', exerciseId: id } : { route: 'exercise' };
}

export function navigate(route: Route, exerciseId?: number): void {
  window.location.hash =
    route === 'exercise' && exerciseId !== undefined ? `#/exercise/${exerciseId}` : `#/${route}`;
}

export function useRoute(): RouteState {
  const [state, setState] = useState<RouteState>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setState(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return state;
}
