import type { ActivityItem, Board, DashboardOverview, Doctor, DoctorView, SimulationRun, Slot, SlotView, Token } from '../types/index.js';

const BASE = '/api';

// The staff key (when the server asks for one) is remembered in this browser only.
const KEY_STORAGE = 'opd.staffKey';
export const AUTH_NEEDED_EVENT = 'opd:auth-needed';

export function getStaffKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setStaffKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* private mode: the key is just not remembered */
  }
}

class ApiError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(getStaffKey() ? { 'X-API-Key': getStaffKey() } : {}), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 401 && body?.error?.code === 'UNAUTHORIZED') {
    window.dispatchEvent(new Event(AUTH_NEEDED_EVENT));
  }
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(err?.code ?? 'UNKNOWN', err?.message ?? `Request failed with status ${res.status}`);
  }
  return body as T;
}

export const api = {
  doctors: {
    list: () => request<Doctor[]>('/doctors'),
    delay: (id: string, delayMinutes: number) => request(`/doctors/${id}/delay`, { method: 'POST', body: JSON.stringify({ delayMinutes }) }),
    markUnavailable: (id: string, reason: string) =>
      request(`/doctors/${id}/unavailable`, { method: 'POST', body: JSON.stringify({ reason }) }),
    markAvailable: (id: string) => request(`/doctors/${id}/available`, { method: 'POST' }),
  },
  slots: {
    list: (doctorId?: string) => request<Slot[]>(`/slots${doctorId ? `?doctorId=${doctorId}` : ''}`),
    reallocate: (id: string) => request(`/slots/${id}/reallocate`, { method: 'POST' }),
  },
  tokens: {
    list: (params: Record<string, string> = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request<Token[]>(`/tokens${qs ? `?${qs}` : ''}`);
    },
    get: (id: string) => request<Token>(`/tokens/${id}`),
    create: (data: { doctorId: string; slotId: string; source: string; patientName: string }) =>
      request<Token>('/tokens', { method: 'POST', body: JSON.stringify(data) }),
    cancel: (id: string) => request<Token>(`/tokens/${id}/cancel`, { method: 'POST' }),
    noShow: (id: string) => request<Token>(`/tokens/${id}/no-show`, { method: 'POST' }),
    call: (id: string) => request<Token>(`/tokens/${id}/call`, { method: 'POST' }),
    start: (id: string) => request<Token>(`/tokens/${id}/start`, { method: 'POST' }),
    complete: (id: string) => request<Token>(`/tokens/${id}/complete`, { method: 'POST' }),
  },
  emergencies: {
    create: (data: { doctorId: string; slotId?: string; patientName: string; reason: string }) =>
      request<{ token: Token; displaced: { displacedTokenId: string; movedToSlotId: string | null } | null }>('/emergencies', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  dashboard: {
    overview: () => request<DashboardOverview>('/dashboard/overview'),
    doctors: () => request<DoctorView[]>('/dashboard/doctors'),
    slots: () => request<SlotView[]>('/dashboard/slots'),
    board: () => request<Board>('/dashboard/board'),
    activity: (limit = 40) => request<ActivityItem[]>(`/dashboard/activity?limit=${limit}`),
  },
  simulation: {
    run: () => request<SimulationRun>('/simulation/run', { method: 'POST', body: JSON.stringify({ confirm: 'replace-all-data' }) }),
  },
};

export { ApiError };
