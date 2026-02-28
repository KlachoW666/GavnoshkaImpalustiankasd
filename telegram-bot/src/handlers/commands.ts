import { Telegraf, Context } from 'telegraf';
import { Keyboards } from '../utils/keyboard';

export const setupCommands = (bot: Telegraf<any>) => {
    bot.start(async (ctx: Context) => {
        await ctx.reply(
            '🌟 Добро пожаловать в CLABX 🚀\n\n' +
            '• 💎 Оформите PREMIUM-подписку на сайт clabx.ru\n' +
            '• 🛡️ Зарегистрируйтесь на сайте через бота (безопасно, синхронизация с ключами)\n' +
            '• 🔑 Восстановите пароль, если аккаунт привязан к этому Telegram',
            Keyboards.mainMenu()
        );
    });

    bot.hears('🔑 Зарегистрироваться на сайте', async (ctx: any) => {
        await ctx.scene.enter('REGISTER_SCENE');
    });

    bot.hears('🔄 Восстановить пароль', async (ctx: any) => {
        await ctx.scene.enter('RESET_PASSWORD_SCENE');
    });
};
