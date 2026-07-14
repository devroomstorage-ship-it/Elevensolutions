import Cookies from 'js-cookie';

export const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

let isRefreshing = false;
let refreshQueue = [];

const processQueue = (error, token) => {
  refreshQueue.forEach(({ resolve, reject }) => error ? reject(error) : resolve(token));
  refreshQueue = [];
};

// Staff and clients share this fetch wrapper but log in on different pages —
// send an expired session back to whichever login page matches where it was.
const loginUrl = () =>
  typeof window !== 'undefined' && window.location.pathname.startsWith('/account')
    ? '/account/login'
    : '/portal/login';

export const api = async (path, options = {}) => {
  const accessToken = Cookies.get('es_access_token');

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  // Auto-refresh on 401
  if (res.status === 401) {
    const json = await res.json().catch(() => ({}));
    if (json.code === 'TOKEN_EXPIRED') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => api(path, options));
      }

      isRefreshing = true;
      const refreshToken = Cookies.get('es_refresh_token');
      if (!refreshToken) {
        window.location.href = loginUrl();
        return;
      }

      try {
        const refreshRes = await fetch(`${BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!refreshRes.ok) throw new Error('Refresh failed');
        const data = await refreshRes.json();
        Cookies.set('es_access_token', data.accessToken, { secure: true, sameSite: 'strict' });
        Cookies.set('es_refresh_token', data.refreshToken, { secure: true, sameSite: 'strict', expires: 7 });
        processQueue(null, data.accessToken);
        isRefreshing = false;
        return api(path, options);
      } catch {
        processQueue(new Error('Session expired'), null);
        isRefreshing = false;
        Cookies.remove('es_access_token');
        Cookies.remove('es_refresh_token');
        window.location.href = loginUrl();
        return;
      }
    }
    throw { status: 401, message: json.error || 'Unauthorised' };
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw { status: res.status, message: err.error || 'Request failed' };
  }

  return res.json();
};

// Convenience methods
export const get    = (path)         => api(path, { method: 'GET' });
export const post   = (path, body)   => api(path, { method: 'POST',  body: JSON.stringify(body) });
export const patch  = (path, body)   => api(path, { method: 'PATCH', body: JSON.stringify(body) });
export const del    = (path)         => api(path, { method: 'DELETE' });
