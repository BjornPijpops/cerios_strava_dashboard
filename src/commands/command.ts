import { App } from '../app';
import { AppConfig } from '../infra/config';

/** Everything a command may need. `app()` is lazy because admin commands must not read or seed `data/`. */
export interface CommandContext {
  /** Arguments after the command name. */
  args: string[];
  config: AppConfig;
  app(): App;
}

export interface Command {
  name: string;
  /** Argument synopsis for the usage text, e.g. "[quarter]". */
  usage?: string;
  description: string;
  run(ctx: CommandContext): Promise<void> | void;
}
