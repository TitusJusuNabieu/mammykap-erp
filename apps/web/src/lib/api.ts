const BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

class APIError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('access_token') : null;

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new APIError(
      json.code ?? 'UNKNOWN',
      json.message ?? `HTTP ${res.status}`,
      res.status,
      json.details,
    );
  }

  return json as T;
}

export const api = {
  get:    <T>(path: string) => request<T>(path),
  post:   <T>(path: string, body: unknown) => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  patch:  <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string)                => request<T>(path, { method: 'DELETE' }),
};

// ── Auth ────────────────────────────────────────────
export const authApi = {
  login:    (email: string, password: string) =>
    api.post<{ data: { access_token: string; user: Record<string, unknown> } }>('/v1/auth/login', { email, password }),
  register: (body: unknown) =>
    api.post<{ data: { user: Record<string, unknown>; organization: { id: string; slug: string; name: string } } }>('/v1/auth/register', body),
  logout:        () => api.post('/v1/auth/logout', {}),
  me:            () => api.get<{ data: unknown }>('/v1/auth/me'),
  forgotPassword: (email: string) => api.post('/v1/auth/forgot-password', { email }),
  resetPassword:  (token: string, password: string) => api.post('/v1/auth/reset-password', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ data: { success: boolean } }>('/v1/auth/change-password', { currentPassword, newPassword }),
};

// ── Products ────────────────────────────────────────
export const productsApi = {
  list:   (params?: Record<string, unknown>) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return api.get<{ data: unknown[] }>(`/v1/products${qs}`);
  },
  get:    (id: string) => api.get<{ data: unknown }>(`/v1/products/${id}`),
  create: (body: unknown) => api.post<{ data: unknown }>('/v1/products', body),
  update: (id: string, body: unknown) => api.patch<{ data: unknown }>(`/v1/products/${id}`, body),
};

// ── Sales ────────────────────────────────────────────
export const salesApi = {
  list:   (params?: Record<string, unknown>) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : '';
    return api.get<{ data: unknown[] }>(`/v1/sales${qs}`);
  },
  get:    (id: string) => api.get<{ data: unknown }>(`/v1/sales/${id}`),
  create: (body: unknown) => api.post<{ data: unknown }>('/v1/sales', body),
  void:   (id: string, reason: string) => api.post(`/v1/sales/${id}/void`, { reason }),
};

// ── Quotes ──────────────────────────────────────────
export const quotesApi = {
  list:   (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ data: unknown[] }>(`/v1/quotes${qs}`);
  },
  get:    (id: string) => api.get<{ data: unknown }>(`/v1/quotes/${id}`),
  create: (body: unknown) => api.post<{ data: unknown }>('/v1/quotes', body),
  update: (id: string, body: unknown) => api.patch<{ data: unknown }>(`/v1/quotes/${id}`, body),
  delete: (id: string) => api.delete(`/v1/quotes/${id}`),
};

// ── Public storefront (no auth) ───────────────────────
export const publicApi = {
  getOrg:     () => api.get<{ data: { name: string; address: string | null; phone: string | null; email: string | null; logoUrl: string | null } }>('/v1/public/org'),
  getCatalog: (q?: string) => api.get<{ data: unknown[] }>(`/v1/public/catalog${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  submitPurchaseRequest: (body: {
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    notes?: string;
    lines: { productId: string; quantity: number }[];
  }) => api.post<{ data: { referenceNumber: string; totalAmount: string; lines: unknown[] } }>('/v1/public/purchase-requests', body),
};

// ── Store Requests ────────────────────────────────────
export const storeRequestsApi = {
  list:    (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ data: unknown[] }>(`/v1/store-requests${qs}`);
  },
  get:     (id: string) => api.get<{ data: unknown }>(`/v1/store-requests/${id}`),
  supply:  (id: string, body: { lines?: { storeRequestLineId: string; quantity: number }[]; notes?: string }) =>
    api.post<{ data: unknown }>(`/v1/store-requests/${id}/supply`, body),
  reject:  (id: string, body: { reason: string; lines?: { storeRequestLineId: string; quantity: number }[] }) =>
    api.post<{ data: unknown }>(`/v1/store-requests/${id}/reject`, body),
};

// ── Daily Close ────────────────────────────────────────
export const dailyCloseApi = {
  status: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ data: Record<string, unknown> }>(`/v1/daily-close/status${qs}`);
  },
  close:  (body: { date?: string; branchId?: string; notes?: string }) =>
    api.post<{ data: unknown }>('/v1/daily-close', body),
  list:   (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get<{ data: unknown[] }>(`/v1/daily-close${qs}`);
  },
};

// ── Reports ──────────────────────────────────────────
export const reportsApi = {
  pnl:           (params: Record<string, string>) =>
    api.get<{ data: unknown }>('/v1/reports/profit-loss?' + new URLSearchParams(params)),
  balanceSheet:  (as_of: string) =>
    api.get<{ data: unknown }>(`/v1/reports/balance-sheet?as_of=${as_of}`),
  trialBalance:  (params: Record<string, string>) =>
    api.get<{ data: unknown }>('/v1/reports/trial-balance?' + new URLSearchParams(params)),
  salesSummary:  (from: string, to: string) =>
    api.get<{ data: unknown }>(`/v1/reports/sales-summary?from=${from}&to=${to}`),
  inventoryValuation: (branchId?: string) =>
    api.get<{ data: unknown }>(`/v1/reports/inventory-valuation${branchId ? `?branch_id=${branchId}` : ''}`),
};
