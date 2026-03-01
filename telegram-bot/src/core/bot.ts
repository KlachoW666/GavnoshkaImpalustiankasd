import { Telegraf, Scenes, session } from 'telegraf';
import { config } from '../config';
import { setupCommands } from '../handlers/commands';
import { setupPayments } from '../handlers/payments';
import { registerScene } from '../scenes/registerScene';
import { resetPasswordScene } from '../scenes/resetPasswordScene';

// Инициализация бота
export const bot = new Telegraf<any>(config.TELEGRAM_BOT_TOKEN);

// Инициализация сцен (Stage<any> — обходит несовместимость WizardScene vs BaseScene)
const stage = new Scenes.Stage<any>([registerScene as any, resetPasswordScene as any]);

// Глобальные Middleware
bot.use(session());
bot.use(stage.middleware());

// Подключение обработчиков
setupCommands(bot);
setupPayments(bot);

// Обработчик непредвиденных ошибок
bot.catch((err: unknown) => {
    console.error('Telegraf Global Error:', err);
});
