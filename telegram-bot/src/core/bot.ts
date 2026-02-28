import { Telegraf, Scenes, session } from 'telegraf';
import { config } from '../config';
import { setupCommands } from '../handlers/commands';
import { setupPayments } from '../handlers/payments';
import { registerScene } from '../scenes/registerScene';
import { resetPasswordScene } from '../scenes/resetPasswordScene';

// Инициализация бота
export const bot = new Telegraf<any>(config.TELEGRAM_BOT_TOKEN);

// Инициализация сцен (Stage)
const stage = new Scenes.Stage([registerScene, resetPasswordScene]);

// Глобальные Middleware
bot.use(session());
bot.use(stage.middleware());

// Подключение обработчиков
setupCommands(bot);
setupPayments(bot);

// Обработчик непредвиденных ошибок, чтобы бот не падал
bot.catch((err) => {
    console.error('Telegraf Global Error:', err);
});
