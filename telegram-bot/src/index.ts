import { bot } from './core/bot';

async function main() {
  await bot.launch();
  console.log('✅ CLABX Telegram Bot started successfully.');

  // Настройка плавного завершения работы
  process.once('SIGINT', () => {
    console.log('SIGINT signal received.');
    bot.stop('SIGINT');
  });

  process.once('SIGTERM', () => {
    console.log('SIGTERM signal received.');
    bot.stop('SIGTERM');
  });
}

main().catch((e) => {
  console.error('Fatal Bot Error:', e);
  process.exit(1);
});
