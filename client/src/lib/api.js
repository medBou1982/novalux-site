// Client HTTP minimal pour l'API Novalux.
const CUSTOMER_KEY = 'nv_token';
const ADMIN_KEY = 'nv_admin_token';

const safeGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* stockage indisponible */ } };

export const tokens = {
  customer: () => safeGet(CUSTOMER_KEY),
  setCustomer: (t) => safeSet(CUSTOMER_KEY, t),
  admin: () => safeGet(ADMIN_KEY),
  setAdmin: (t) => safeSet(ADMIN_KEY, t),
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details || {};
  }
}

async function request(path, { method = 'GET', body, token, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: form || (body !== undefined ? JSON.stringify(body) : undefined) });
  } catch {
    throw new ApiError(0, 'Connexion au serveur impossible. Vérifiez votre connexion internet.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Erreur ${res.status}`, data.details);
  return data;
}

/** API publique (jeton client ajouté s'il existe). */
export const api = {
  get: (p) => request(p, { token: tokens.customer() }),
  post: (p, body) => request(p, { method: 'POST', body, token: tokens.customer() }),
  put: (p, body) => request(p, { method: 'PUT', body, token: tokens.customer() }),
};

/** API admin (jeton admin). Une 401 déconnecte l'admin. */
async function adminRequest(path, opts = {}) {
  try {
    return await request(`/admin${path}`, { ...opts, token: tokens.admin() });
  } catch (err) {
    if (err.status === 401 && path !== '/login') {
      tokens.setAdmin(null);
      window.dispatchEvent(new Event('nv:admin-logout'));
    }
    throw err;
  }
}

export const adminApi = {
  get: (p) => adminRequest(p),
  post: (p, body) => adminRequest(p, { method: 'POST', body }),
  put: (p, body) => adminRequest(p, { method: 'PUT', body }),
  patch: (p, body) => adminRequest(p, { method: 'PATCH', body }),
  del: (p) => adminRequest(p, { method: 'DELETE' }),
  upload: (p, form) => adminRequest(p, { method: 'POST', form }),
};
