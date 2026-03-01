import { Telegraf, Scenes, session } from 'telegraf';
import type { WizardContext } from 'telegraf/typings/scenes';
import { config } from '../config';
import { setupCommands } from '../handlers/commands';
import { setupPayments } from '../handlers/payments';
import { registerScene } from '../scenes/registerScene';
import { resetPasswordScene } from '../scenes/resetPasswordScene';

// Типизированный контекст бота с поддержкой session и wizard-сцен
export type BotContext = Telegraf.Context & WizardContext;

// Инициализация бота с типом any чтобы не конфликтовал с Context в сценах
export const bot = new Telegraf<any>(config.TELEGRAM_BOT_TOKEN);

// Инициализация сцен
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
