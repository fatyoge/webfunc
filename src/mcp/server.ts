import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { listSkills, loadSkill } from '../core/skill-loader.js';
import { SkillExecutor } from '../core/executor.js';
import { BrowserBridge } from '../core/browser-bridge.js';
import { CookieStore } from '../core/cookie-store.js';
import type { Skill, SkillParameter } from '../types/skill.js';

export interface McpServerOptions {
  skillsDir: string;
  profile?: string;
}

function parameterToJsonSchema(param: SkillParameter): Record<string, object | string | number | boolean> {
  const schema: Record<string, object | string | number | boolean> = {
    type: param.type === 'number' ? 'number' : param.type === 'boolean' ? 'boolean' : 'string',
  };
  if (param.description) schema.description = param.description;
  if (param.default !== undefined) schema.default = param.default;
  return schema;
}

export async function startMcpServer(options: McpServerOptions): Promise<void> {
  const listed = await listSkills(options.skillsDir);
  const skills: Map<string, Skill> = new Map();
  for (const { skill } of listed) {
    if (!skill?.name || !Array.isArray(skill.steps)) {
      continue;
    }
    skills.set(skill.name, skill);
  }

  const tools: Tool[] = [];
  for (const skill of skills.values()) {
    const properties: Record<string, object> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(skill.parameters || {})) {
      properties[key] = parameterToJsonSchema(param);
      if (param.required) required.push(key);
    }

    tools.push({
      name: skill.name,
      description: skill.description || `Execute ${skill.name} skill`,
      inputSchema: {
        type: 'object',
        properties,
        required,
      },
    });
  }

  let bridge: BrowserBridge | null = null;
  let bridgeContext: Awaited<ReturnType<BrowserBridge['connect']>> | null = null;

  async function ensureBridge(): Promise<BrowserBridge> {
    if (bridge && bridgeContext) return bridge;
    bridge = new BrowserBridge({ userDataDir: options.profile });
    bridgeContext = await bridge.connect();
    return bridge;
  }

  const server = new Server(
    { name: 'webfunc', version: '0.1.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    let skill = skills.get(name);
    if (!skill) {
      try {
        skill = await loadSkill(name, options.skillsDir);
        if (skill?.name && Array.isArray(skill.steps)) {
          skills.set(skill.name, skill);
        }
      } catch {
        // Skill not found
      }
    }
    if (!skill) {
      return {
        content: [{ type: 'text', text: `Skill "${name}" not found` }],
        isError: true,
      };
    }

    const params: Record<string, unknown> = {};
    for (const [key, param] of Object.entries(skill.parameters || {})) {
      if (param.default !== undefined) params[key] = param.default;
    }
    if (args && typeof args === 'object') {
      Object.assign(params, args);
    }

    for (const [key, param] of Object.entries(skill.parameters || {})) {
      if (param.required && params[key] === undefined) {
        return {
          content: [{ type: 'text', text: `Missing required parameter: ${key}` }],
          isError: true,
        };
      }
    }

    const executor = new SkillExecutor();

    try {
      let result;
      if (skill.execution_mode === 'browser') {
        const b = await ensureBridge();
        const page = await b.getPage();
        result = await executor.run(skill, {
          params,
          stepResults: {},
          cookies: '',
          page,
        });
      } else {
        if (!bridge || !bridgeContext) {
          bridge = new BrowserBridge({ userDataDir: options.profile });
          bridgeContext = await bridge.connect();
        }
        const cookieStore = new CookieStore(bridgeContext);
        const cookies = await cookieStore.getCookiesForUrl(skill.target_origin);
        result = await executor.run(skill, {
          params,
          stepResults: {},
          cookies,
        });
      }

      if (result.success) {
        const lines: string[] = [result.summary];
        if (Object.keys(result.extracted).length > 0) {
          lines.push('');
          lines.push('Extracted data:');
          lines.push(JSON.stringify(result.extracted, null, 2));
        }
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } else {
        return {
          content: [{ type: 'text', text: result.error || 'Execution failed' }],
          isError: true,
        };
      }
    } catch (err: any) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
