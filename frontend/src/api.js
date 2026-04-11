const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4010';

function getToken() {
  return localStorage.getItem('cobrai_token');
}

export function setSession(token, user) {
  localStorage.setItem('cobrai_token', token);
  localStorage.setItem('cobrai_user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('cobrai_token');
  localStorage.removeItem('cobrai_user');
}

export function getUser() {
  try { return JSON.parse(localStorage.getItem('cobrai_user')); }
  catch { return null; }
}

async function request(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    body: opts.body instanceof FormData ? opts.body
        : opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export const api = {
  login:        (email, password) => request('/api/auth/login',    { method: 'POST', body: { email, password } }),
  register:     (data)            => request('/api/auth/register', { method: 'POST', body: data }),
  dashboard:    ()                => request('/api/dashboard'),
  debtors:      (params = {})     => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/debtors${q ? '?' + q : ''}`);
  },
  debtor:       (id)              => request(`/api/debtors/${id}`),
  createDebtor: (data)            => request('/api/debtors',       { method: 'POST', body: data }),
  updateStatus: (id, status)      => request(`/api/debtors/${id}`, { method: 'PATCH', body: { status } }),
  uploadDebtors:(file)            => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/debtors/upload', { method: 'POST', body: fd });
  },
  sendMessage:  (id, body)        => request(`/api/debtors/${id}/send`, { method: 'POST', body: { body } }),
  createPayment:(id, amount)      => request(`/api/debtors/${id}/payment`, { method: 'POST', body: { amount } }),
  confirmPayment:(id, paymentId)  => request(`/api/debtors/${id}/payment/${paymentId}/confirm`, { method: 'POST' }),
  // ── Admin ──────────────────────────────────────────────────────────────
  adminStats:         ()              => request('/api/admin/stats'),
  adminCompanies:     (params = {})   => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/admin/companies${q ? '?' + q : ''}`);
  },
  adminCompany:       (id)            => request(`/api/admin/companies/${id}`),
  adminCreateCompany: (data)          => request('/api/admin/companies', { method: 'POST', body: data }),
  adminUpdateCompany: (id, data)      => request(`/api/admin/companies/${id}`, { method: 'PUT', body: data }),
  adminSuspendCompany:(id)            => request(`/api/admin/companies/${id}`, { method: 'DELETE' }),
  adminDestroyCompany:(id)            => request(`/api/admin/companies/${id}/destroy`, { method: 'DELETE' }),
  adminCreateUser:    (companyId, d)  => request(`/api/admin/companies/${companyId}/users`, { method: 'POST', body: d }),
  adminDeleteUser:    (companyId, uid)=> request(`/api/admin/companies/${companyId}/users/${uid}`, { method: 'DELETE' }),
  // ── Clientes ───────────────────────────────────────────────────────────
  clients:      (params = {})     => {
    const q = new URLSearchParams(params).toString();
    return request(`/api/clients${q ? '?' + q : ''}`);
  },
  client:       (phone)           => request(`/api/clients/${encodeURIComponent(phone)}`),
  renameClient: (phone, name)     => request(`/api/clients/${encodeURIComponent(phone)}`, { method: 'PATCH', body: { name } }),
  deleteClient: (phone)           => request(`/api/clients/${encodeURIComponent(phone)}`, { method: 'DELETE' }),
  getSettings:   ()               => request('/api/settings'),
  saveSettings:  (data)           => request('/api/settings', { method: 'PUT', body: data }),
  testEvolution: (data)           => request('/api/settings/test-evolution', { method: 'POST', body: data }),
  runScheduler:  ()               => request('/api/scheduler/run', { method: 'POST' }),
};
