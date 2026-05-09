import { appendTokenParam } from '../../lib/auth-url.js';

export type Project = {
  id: string;
  title: string;
  root: string;
  createdAt: number;
  updatedAt: number;
  outputs: Output[];
};

export type Output = {
  id: string;
  filePath: string;
  label: string;
  format: string;
  bytes: number | null;
  createdAt: number;
};

export type Task = {
  id: string;
  type: string;
  projectId: string | null;
  status: string;
  error: string | null;
  result: unknown;
  updatedAt: number;
};

export type Diagnostics = {
  ok: boolean;
  checks: Array<{ id: string; label: string; ok: boolean; detail: string }>;
  dataDir: string;
  projects: number;
  previews: Array<Preview>;
};

export type Preview = {
  projectId: string;
  url: string;
  rawUrl?: string;
  proxyUrl?: string;
  status: string;
  error: string | null;
};

const basePath = window.location.pathname.replace(/\/studio\/?$/, '');
const authToken = new URLSearchParams(window.location.search).get('token') || '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(appendTokenParam(`${basePath}${path}`, authToken), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || data?.result?.error || data?.message || `Request failed: ${response.status}`);
  }
  return data as T;
}

export const api = {
  diagnostics: () => request<Diagnostics>('/api/diagnostics'),
  listProjects: () => request<{ projects: Project[] }>('/api/projects'),
  createProject: (title: string) => request<{ project: Project }>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ title }),
  }),
  startPreview: (projectId: string) => request<{ preview: Preview }>(`/api/projects/${encodeURIComponent(projectId)}/preview`, {
    method: 'POST',
  }),
  lintProject: (projectId: string) => request<{ task: Task; result: unknown }>(`/api/projects/${encodeURIComponent(projectId)}/lint`, {
    method: 'POST',
  }),
  renderProject: (projectId: string, options: { format: string; fps: number; quality: string }) =>
    request<{ task: Task; result: unknown }>(`/api/projects/${encodeURIComponent(projectId)}/render`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),
  listTasks: () => request<{ tasks: Task[] }>('/api/tasks'),
};
