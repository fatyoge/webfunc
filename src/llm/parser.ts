import Anthropic from '@anthropic-ai/sdk';
import { Skill } from '../types/skill';

export interface LLMParserOptions {
  apiKey: string;
  model?: string;
}

export class LLMParser {
  private client: Anthropic;
  private model: string;

  constructor(options: LLMParserOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.model = options.model || 'claude-3-sonnet-20240229';
  }

  async parse(userInput: string, skill: Skill): Promise<Record<string, unknown>> {
    const parameterSchema = JSON.stringify(skill.parameters, null, 2);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: `You are a parameter extractor. Extract values from user input and return ONLY a JSON object matching the given parameter schema. Do not include any explanation.`,
      messages: [
        {
          role: 'user',
          content: `Skill: ${skill.name}\nParameters schema:\n${parameterSchema}\n\nUser request: "${userInput}"\n\nReturn only a JSON object with the extracted parameter values.`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    return JSON.parse(text);
  }
}
