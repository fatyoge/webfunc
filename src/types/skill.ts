export interface SkillParameter {
  type: 'string' | 'number' | 'boolean';
  required?: boolean;
  default?: string | number | boolean;
  description?: string;
}

export interface SkillStep {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: Record<string, unknown> | string;
  extract?: Record<string, string>;
  assert?: Record<string, unknown>;
  retry?: number;
}

export interface SkillOutput {
  summary: string;
  extract?: Record<string, string>;
}

export interface Skill {
  name: string;
  version: string;
  description?: string;
  target_origin: string;
  parameters: Record<string, SkillParameter>;
  steps: SkillStep[];
  output: SkillOutput;
  post_process?: string;
  execution_mode?: 'http' | 'browser';
}

export interface ExecutionContext {
  params: Record<string, unknown>;
  stepResults: Record<string, { response: unknown; status: number }>;
  cookies: string;
  page?: import('playwright').Page;
}

export interface ExecutionResult {
  success: boolean;
  summary: string;
  extracted: Record<string, unknown>;
  error?: string;
}
