import type { Skill, ExecutionContext, ExecutionResult, SkillStep } from './skill';

export interface SkillModule {
  /** 可覆盖/补充 skill.json 中的元信息 */
  meta?: Partial<Skill>;

  /** 执行前钩子：参数校验、环境检查 */
  beforeRun?(context: ExecutionContext): Promise<void>;

  /** 自定义步骤执行器（未定义则走默认 HTTP/browser 执行） */
  executeStep?(
    step: SkillStep,
    context: ExecutionContext
  ): Promise<{ status: number; data: unknown }>;

  /** 后置处理：数据格式化、文件生成、通知发送等 */
  postProcess?(result: ExecutionResult, context: ExecutionContext): Promise<ExecutionResult>;

  /** 执行后钩子：清理、日志等 */
  afterRun?(result: ExecutionResult, context: ExecutionContext): Promise<void>;
}
