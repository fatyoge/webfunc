import { SkillStep, ExecutionContext } from '../types/skill';

export function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = values[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

function getValueByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part.includes('[') && part.includes(']')) {
      const arrName = part.slice(0, part.indexOf('['));
      const indexStr = part.slice(part.indexOf('[') + 1, part.indexOf(']'));
      const index = parseInt(indexStr, 10);
      if (arrName) current = (current as Record<string, unknown>)[arrName];
      if (Array.isArray(current)) current = current[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }
  return current;
}

export function renderSkillStep(step: SkillStep, context: ExecutionContext): SkillStep {
  const allValues: Record<string, unknown> = { ...context.params };

  // Add step result references: _stepId.response.path
  for (const [stepId, result] of Object.entries(context.stepResults)) {
    const responseObj = result.response as Record<string, unknown>;
    allValues[`_${stepId}.response`] = responseObj;
  }

  const renderValue = (value: unknown): unknown => {
    if (typeof value === 'string') {
      // Handle _stepId.response.path references
      if (value.startsWith('{{_') && value.endsWith('}}')) {
        const inner = value.slice(2, -2); // _stepId.response.path
        const parts = inner.split('.');
        if (parts.length >= 3 && parts[1] === 'response') {
          const stepId = parts[0].slice(1); // remove leading underscore
          const path = parts.slice(2).join('.');
          const result = context.stepResults[stepId];
          if (result) {
            const extracted = getValueByPath(result.response, path);
            return extracted !== undefined ? extracted : value;
          }
        }
      }
      return renderTemplate(value, allValues);
    }
    if (Array.isArray(value)) return value.map(renderValue);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, renderValue(v)])
      );
    }
    return value;
  };

  return {
    ...step,
    url: renderTemplate(step.url, allValues),
    headers: step.headers ? Object.fromEntries(
      Object.entries(step.headers).map(([k, v]) => [k, renderValue(v)])
    ) as Record<string, string> : undefined,
    query: step.query ? Object.fromEntries(
      Object.entries(step.query).map(([k, v]) => [k, renderValue(v)])
    ) : undefined,
    body: step.body ? renderValue(step.body) as Record<string, unknown> | string : undefined,
  };
}
