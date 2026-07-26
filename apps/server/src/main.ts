import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { MIGRATIONS_DIR, openDatabase, runMigrations } from '@gym-tracker/db';
import { createBot } from './bot/bot';
import { setBotCommands } from './bot/welcome';
import { ConfigError, loadConfig } from './config';
import { initI18n } from './i18n/index';

function main(): void {
  const config = loadConfig();
  initI18n(); // antes de crear el bot: cualquier handler puede pintar texto
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = openDatabase(config.dbPath);
  const applied = runMigrations(db, MIGRATIONS_DIR);
  if (applied.length > 0) {
    console.log(`[db] applied migrations: ${applied.join(', ')}`);
  }

  const bot = createBot(config.telegramBotToken, db, config);

  const shutdown = (signal: string): void => {
    console.log(`[shutdown] ${signal} received`);
    void bot
      .stop()
      .catch((error) => console.error(`[shutdown] bot.stop failed: ${String(error)}`))
      .finally(() => {
        db.close();
        process.exit(0);
      });
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  void bot.start({
    onStart: (info) => {
      console.log(`[bot] long polling as @${info.username}`);
      // Si Telegram no responde a esta llamada el bot debe arrancar igual: solo se
      // registra el fallo en el log (spec §6). onStart es síncrono, así que la
      // promesa se descarta con void en vez de esperarla.
      void setBotCommands(bot.api).catch((error) =>
        console.error(`[bot] setMyCommands failed: ${String(error)}`),
      );
    },
  });
}

try {
  main();
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(`[config] ${error.message}`);
  } else {
    console.error(`[fatal] ${error instanceof Error ? error.message : String(error)}`);
  }
  process.exit(1);
}
