import { useEffect } from 'react';

const BASE_TITLE = 'E[X] · Northeastern Prediction Markets';

/** Sets the document title for a route; restores the base title on unmount. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · E[X]` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [title]);
}
