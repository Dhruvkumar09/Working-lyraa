import { Type, type Schema } from '@google/genai';

export type ToolArgs = Record<string, unknown>;
export type ToolResult = Record<string, unknown>;

/** Alias so tool definitions read naturally; the SDK validates the shape. */
export type ToolSchema = Schema;

/** The model sends every argument as a string over the wire anyway. */
export function stringProp(description: string, values?: string[]): Schema {
  return values ? { type: Type.STRING, description, enum: values } : { type: Type.STRING, description };
}

export function objectSchema(properties: Record<string, Schema>, required?: string[]): Schema {
  return { type: Type.OBJECT, properties, required };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters?: ToolSchema;
  /** Spoken confirmation shown in the activity feed. */
  summary: (args: ToolArgs) => string;
  /**
   * Present on anything Dhruv would not want done by accident — placing calls,
   * sending messages, changing system settings, deleting things. Returns the
   * question to ask him. The tool does not run until he agrees.
   */
  confirm?: (args: ToolArgs) => string;
  run: (args: ToolArgs) => Promise<ToolResult>;
}

/** A sensitive call waiting on Dhruv, and the moment it stops being valid. */
interface Pending {
  name: string;
  args: ToolArgs;
  question: string;
  at: number;
}

/**
 * A "yes" is only meaningful while the question is still fresh in the
 * conversation, so an unanswered request expires rather than lingering.
 */
const PENDING_TTL_MS = 90_000;

export class ToolManager {
  private tools = new Map<string, ToolDefinition>();
  private onActivity?: (text: string, ok: boolean) => void;
  private pending: Pending | null = null;

  constructor(onActivity?: (text: string, ok: boolean) => void) {
    this.onActivity = onActivity;
  }

  register(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  registerAll(tools: ToolDefinition[]): this {
    for (const tool of tools) this.register(tool);
    return this;
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  /** Shape the Live API expects under `tools: [{ functionDeclarations }]`. */
  declarations(): Array<{ name: string; description: string; parameters?: ToolSchema }> {
    return this.list().map(({ name, description, parameters }) =>
      parameters ? { name, description, parameters } : { name, description },
    );
  }

  /** The question awaiting an answer, or null. Expired requests read as null. */
  pendingQuestion(): string | null {
    if (!this.pending) return null;
    if (Date.now() - this.pending.at > PENDING_TTL_MS) {
      this.pending = null;
      return null;
    }
    return this.pending.question;
  }

  cancelPending(): { ok: true; cancelled: boolean } {
    const cancelled = this.pendingQuestion() !== null;
    this.pending = null;
    if (cancelled) this.onActivity?.('Cancelled', false);
    return { ok: true, cancelled };
  }

  /** Runs the held action now that Dhruv has agreed to it. */
  async confirmPending(): Promise<ToolResult> {
    if (this.pendingQuestion() === null) {
      this.pending = null;
      return { ok: false, error: 'There is nothing waiting to be confirmed' };
    }
    const { name, args } = this.pending as Pending;
    this.pending = null;
    return this.execute(name, args);
  }

  async dispatch(name: string, args: ToolArgs = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      this.onActivity?.(`Unknown tool: ${name}`, false);
      return { ok: false, error: `No tool named ${name}` };
    }

    if (tool.confirm) {
      const question = tool.confirm(args);
      this.pending = { name, args, question, at: Date.now() };
      this.onActivity?.(`Waiting on you: ${question}`, true);
      return { ok: false, needsConfirmation: true, question };
    }

    return this.execute(name, args);
  }

  private async execute(name: string, args: ToolArgs): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, error: `No tool named ${name}` };
    try {
      const result = await tool.run(args);
      const ok = result.ok !== false;
      this.onActivity?.(tool.summary(args), ok);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.onActivity?.(`${tool.summary(args)} failed: ${message}`, false);
      return { ok: false, error: message };
    }
  }
}

export function str(args: ToolArgs, key: string, fallback = ''): string {
  const value = args[key];
  return typeof value === 'string' ? value : fallback;
}

export function num(args: ToolArgs, key: string, fallback: number): number {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}
