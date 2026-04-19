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

  async generateHoraeFailedTasksMarkdown(result, skill) {
    const tasks = result.extracted?.tasks as { headers: string[]; rows: Array<Record<string, unknown>> } | undefined;
    if (!tasks || !Array.isArray(tasks.rows)) {
      return { ...result, summary: `${result.summary} (no tasks to generate markdown)` };
    }

    const origin = skill.target_origin.replace(/\/$/, '');
    const now = new Date().toLocaleString('zh-CN');
    let md = `# Horae 失败任务清单\n\n> 查询时间：${now}\n> 查询人：${(result.extracted?.in_charge as string) || 'unknown'}\n\n`;
    md += '| 任务ID | 任务名称 | 周期 | 数据时间 | 状态 | 任务类型 | 优先级 | 运行时长 | 责任人 | 日志 |\n';
    md += '|--------|----------|------|----------|------|----------|--------|----------|--------|------|\n';

    for (const row of tasks.rows) {
      const op = row['操作'] as { text?: string; links?: Array<{ text: string; href: string; onclick?: string }> } | string | undefined;
      let logUrl = '';
      if (op && typeof op === 'object' && Array.isArray(op.links)) {
        const logLink = op.links.find((l: any) => l.text === '日志');
        if (logLink?.href && !logLink.href.startsWith('javascript:') && logLink.href !== '') {
          logUrl = logLink.href.startsWith('http') ? logLink.href : `${origin}${logLink.href}`;
        } else if (logLink?.onclick) {
          // Parse viewLog('ip','task_id','task_type','data_time','log_filename','state')
          const argsMatch = logLink.onclick.match(/viewLog\(([^)]+)\)/);
          if (argsMatch) {
            const args = argsMatch[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
            if (args.length >= 6) {
              const [ip, taskId, taskType, dataTime, logFile, state] = args;
              const dataTimeFmt = dataTime.replace(/[-: ]/g, '').replace(/\.\d+$/, '');
              const logPrefix = logFile.replace(/\.log$/, '');
              const logPath = `/tasklog/${taskId}/${dataTimeFmt}/${taskType}/${ip}/${logFile}`;
              const badLogPath = `/tasklog/${taskId}/${dataTimeFmt}/${taskType}/${ip}/${logPrefix}.bad.log`;
              logUrl = `${origin}/Hive/task/taskLog?url=${encodeURIComponent(logPath)}&task_id=${taskId}&badlogUrl=${encodeURIComponent(badLogPath)}&state=${state}`;
            }
          }
        }
      }

      const taskIdCell = row['任务ID'] || row['col1'] || '';
      const taskId = (typeof taskIdCell === 'object' && taskIdCell !== null ? (taskIdCell as { text?: string }).text : taskIdCell) as string;
      const taskNameCell = row['任务名称'] || row['col2'] || '';
      const taskName = (typeof taskNameCell === 'object' && taskNameCell !== null ? (taskNameCell as { text?: string }).text : taskNameCell) as string;
      const cycle = (row['周期'] || row['col3'] || '') as string;
      const dataTime = (row['数据时间'] || row['col4'] || '') as string;
      const state = (row['状态'] || row['col5'] || '') as string;
      const taskType = (row['任务类型'] || row['col6'] || '') as string;
      const priority = (row['优先级'] || row['col8'] || '') as string;
      const duration = (row['运行时长'] || row['col11'] || '') as string;
      const owner = (row['责任人'] || row['col12'] || '') as string;

      const logCol = logUrl ? `[查看日志](${logUrl})` : '-';
      md += `| ${taskId} | ${taskName} | ${cycle} | ${dataTime} | ${state} | ${taskType} | ${priority} | ${duration} | ${owner} | ${logCol} |\n`;
    }

    const filename = `horae-failed-tasks-${Date.now()}.md`;
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
