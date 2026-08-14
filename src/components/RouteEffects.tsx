import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { titleForPath } from '@/lib/routeTitles';

export default function RouteEffects() {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = titleForPath(pathname);
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);

  return null;
}
