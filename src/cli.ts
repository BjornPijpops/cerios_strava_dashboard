import { createApp } from './app';
import { commands, usage } from './commands';
import { loadConfig } from './infra/config';

/** Entry point: look the command up in the registry and run it. */
async function main(): Promise<void> {
  const [name, ...args] = process.argv.slice(2);
  const command = commands.find((c) => c.name === name);
  if (!command) {
    console.log(usage());
    process.exitCode = 1;
    return;
  }
  const config = loadConfig();
  await command.run({ args, config, app: () => createApp(config) });
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
