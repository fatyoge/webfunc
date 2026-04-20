import path from 'path';

export interface ParsedSource {
  type: 'git' | 'local';
  repo?: string;
  branch?: string;
  path?: string;
  localPath?: string;
}

export function parseSource(source: string): ParsedSource {
  if (
    source.startsWith('.') ||
    source.startsWith('/') ||
    source.startsWith('\\\\') ||
    /^[a-zA-Z]:/.test(source)
  ) {
    return { type: 'local', localPath: path.resolve(source) };
  }

  let repoUrl = source;
  let ref = '';

  const hashIndex = repoUrl.indexOf('#');
  if (hashIndex !== -1) {
    ref = repoUrl.slice(hashIndex + 1);
    repoUrl = repoUrl.slice(0, hashIndex);
  }

  if (!repoUrl.includes('://') && !repoUrl.includes('@')) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  if (!repoUrl.endsWith('.git')) {
    repoUrl += '.git';
  }

  let branch = 'main';
  let subPath = '';

  if (ref) {
    const colonIndex = ref.indexOf(':');
    if (colonIndex !== -1) {
      branch = ref.slice(0, colonIndex);
      subPath = ref.slice(colonIndex + 1);
    } else if (ref.includes('/')) {
      subPath = ref;
    } else {
      branch = ref;
    }
  }

  return { type: 'git', repo: repoUrl, branch, path: subPath };
}
