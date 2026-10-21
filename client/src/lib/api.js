import { useCallback, useEffect, useState } from 'react';

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.fields = body?.fields || [];
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-requested-with': 'fetch' };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${path}`, { method, headers, body: payload, credentials: 'same-origin' });
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

// Loads data with explicit loading / error / reload states.
export function useApi(path, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const load = useCallback(async (silent = false) => {
    if (!path) return;
    if (!silent) setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      setState({ data, error: null, loading: false });
    } catch (e) {
      setState(s => ({ data: s.data, error: e, loading: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export async function openDocument(scope, id) {
  const { url } = await api(`/${scope}/documents/${id}/url`);
  window.open(url, '_blank', 'noopener');
}
