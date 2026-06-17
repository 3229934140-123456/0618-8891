import axios from 'axios';
import type { Document, Module, Endpoint, Comment, DocumentVersion, Changelog, User } from './types';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (!location.pathname.startsWith('/login') && !location.pathname.startsWith('/register')) {
        location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export const authApi = {
  login: (data: { email: string; password: string }) =>
    api.post<{ token: string; user: User }>('/auth/login', data).then((r) => r.data),
  register: (data: { email: string; password: string; name: string }) =>
    api.post<{ token: string; user: User }>('/auth/register', data).then((r) => r.data),
  me: () => api.get<{ user: User }>('/auth/me').then((r) => r.data),
};

export const docApi = {
  list: () => api.get<Document[]>('/documents').then((r) => r.data),
  get: (id: string) => api.get<Document & { modules: Module[]; endpoints: Endpoint[] }>(`/documents/${id}`).then((r) => r.data),
  create: (data: Partial<Document>) => api.post<Document>('/documents', data).then((r) => r.data),
  update: (id: string, data: Partial<Document>) =>
    api.put<Document>(`/documents/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/documents/${id}`).then((r) => r.data),
};

export const moduleApi = {
  create: (docId: string, data: { name: string; description?: string }) =>
    api.post<Module>(`/documents/${docId}/modules`, data).then((r) => r.data),
  update: (id: string, data: Partial<Module>) =>
    api.put<Module>(`/documents/modules/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/documents/modules/${id}`).then((r) => r.data),
};

export const endpointApi = {
  create: (moduleId: string, data: Partial<Endpoint>) =>
    api.post<Endpoint>(`/modules/${moduleId}/endpoints`, data).then((r) => r.data),
  update: (id: string, data: Partial<Endpoint>) =>
    api.put<Endpoint>(`/endpoints/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/endpoints/${id}`).then((r) => r.data),
};

export const commentApi = {
  list: (docId: string) => api.get<Comment[]>(`/documents/${docId}/comments`).then((r) => r.data),
  create: (docId: string, data: { target_type: string; target_id: string; content: string }) =>
    api.post<Comment>(`/documents/${docId}/comments`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/documents/comments/${id}`).then((r) => r.data),
};

export const versionApi = {
  list: (docId: string) => api.get<DocumentVersion[]>(`/documents/${docId}/versions`).then((r) => r.data),
  create: (docId: string, data: { content: any; change_summary?: string }) =>
    api.post(`/documents/${docId}/versions`, data).then((r) => r.data),
  changelogList: (docId: string) => api.get<Changelog[]>(`/documents/${docId}/changelogs`).then((r) => r.data),
  changelogCreate: (docId: string, data: { version: string; changes: any }) =>
    api.post(`/documents/${docId}/changelogs`, data).then((r) => r.data),
  subscribe: (docId: string, email: string) =>
    api.post(`/documents/${docId}/subscribe`, { email }).then((r) => r.data),
};

export const toolApi = {
  proxy: (data: { url: string; method?: string; headers?: any[]; body?: any }) =>
    api.post('/proxy', data).then((r) => r.data),
  importOpenAPI: (docId: string, spec: any) =>
    api.post(`/${docId}/import-openapi`, { spec }).then((r) => r.data),
};

export default api;
