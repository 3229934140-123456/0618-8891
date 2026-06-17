export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  visibility: 'private' | 'public' | 'internal';
  base_url: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  modules?: Module[];
  endpoints?: Endpoint[];
}

export interface Module {
  id: string;
  document_id: string;
  name: string;
  description: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'body';
  type: string;
  required: boolean;
  description: string;
  default?: string;
}

export interface Endpoint {
  id: string;
  module_id: string;
  name: string;
  description: string;
  method: string;
  path: string;
  parameters: Parameter[];
  request_body: any;
  response_schema: any;
  request_examples: Record<string, any>;
  response_examples: Record<string, any>;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  document_id: string;
  target_type: 'document' | 'module' | 'endpoint';
  target_id: string;
  content: string;
  created_by: string;
  created_at: string;
  user?: { name: string; email: string };
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: string;
  change_summary: string;
  created_by: string;
  created_at: string;
  user?: { name: string };
}

export interface Changelog {
  id: string;
  document_id: string;
  version: string;
  changes: string;
  created_at: string;
}
