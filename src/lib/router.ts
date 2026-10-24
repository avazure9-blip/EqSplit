import { useEffect, useState } from 'react';

export interface Route {
  parts: string[];
  query: URLSearchParams;
  raw: string;
}

function parse(): Route {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, q = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw };
}

const depth = (): number => (history.state as { depth?: number } | null)?.depth ?? 0;

export function navigate(to: string, replace = false) {
  const url = `#/${to.replace(/^#?\/?/, '')}`;
  if (replace) history.replaceState({ depth: depth() }, '', url);
  else history.pushState({ depth: depth() + 1 }, '', url);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function goBack(fallback: string) {
  if (depth() > 0) history.back();
  else navigate(fallback, true);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const onChange = () => {
      setRoute(parse());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
