import { useCallback, useEffect, useState } from 'react';

/** Charge une ressource ; `fetcher` est appelé à chaque changement de `deps`. */
export function useFetch(fetcher, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // `deps` décide quand recharger (même principe que useEffect)
  const run = useCallback(fetcher, deps);

  const reload = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    run()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [run]);

  useEffect(() => reload(), [reload]);
  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}
