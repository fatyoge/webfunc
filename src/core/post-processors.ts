import { Skill, ExecutionResult } from '../types/skill';
import fs from 'fs/promises';
import path from 'path';

export type PostProcessor = (result: ExecutionResult, skill: Skill) => Promise<ExecutionResult>;

const processors: Record<string, PostProcessor> = {
  async generateMarkdown(result, skill) {
    const hotList = result.extracted?.hotList as Array<Record<string, unknown>> | undefined;
    if (!hotList || !Array.isArray(hotList)) {
      return { ...result, summary: `${result.summary} (no hotList to generate markdown)` };
    }

    const now = new Date().toLocaleString('zh-CN');
    let md = `# 知乎热榜\n\n> 更新时间：${now}\n\n| 排名 | 标题 | 热度 |\n|------|------|------|\n`;

    hotList.forEach((item, index) => {
      const title = (item.query || '未知') as string;
      const url = `https://www.zhihu.com/search?q=${encodeURIComponent(title)}`;
      const heat = (item.hot_show as string) || '-';
      md += `| ${index + 1} | [${title}](${url}) | ${heat} |\n`;
    });

    const filename = `zhihu-hot-${Date.now()}.md`;
    await fs.writeFile(filename, md);

    return {
      ...result,
      summary: `${result.summary}\nMarkdown saved to: ${path.resolve(filename)}`,
    };
  },
};

export function getPostProcessor(name: string): PostProcessor | undefined {
  return processors[name];
}

export function registerPostProcessor(name: string, processor: PostProcessor): void {
  processors[name] = processor;
}
