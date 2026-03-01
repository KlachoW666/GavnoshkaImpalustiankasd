import { Scenes } from 'telegraf';
import { ApiClient } from '../api/apiClient';
import { Keyboards } from '../utils/keyboard';

// Wizard для сброса пароля
export const resetPasswordScene = new Scenes.WizardScene(
    'RESET_PASSWORD_SCENE',
    async (ctx) => {
        await ctx.reply(
            '🔄 Введите логин от вашего аккаунта на clabx.ru (аккаунт должен быть привязан к этому Telegram):',
            Keyboards.cancel()
        );
        return ctx.wizard.next();
    },
    async (ctx) => {
        if (ctx.message && 'text' in ctx.message) {
            if (ctx.message.text === '❌ Отмена') {
                await ctx.reply('Действие отменено.', Keyboards.mainMenu());
                return ctx.scene.leave();
            }

            const username = ctx.message.text.trim();
            if (!username) {
                await ctx.reply('⚠️ Введите корректный логин:');
                return;
            }

            try {
                const telegramUserId = String(ctx.from?.id ?? '');
                const data = await ApiClient.post<{ ok: boolean; resetUrl?: string; error?: string }>(
                    '/api/bot/request-password-reset',
                    { telegramUserId, username }
                );

                if (data.ok && data.resetUrl) {
                    await ctx.reply(
                        `✅ Запрос одобрен!\n\n🔗 Ссылка для сброса пароля (действует 15 минут):\n\n${data.resetUrl}\n\nОткройте ссылку и задайте новый пароль.`,
                        Keyboards.mainMenu()
                    );
                } else {
                    await ctx.reply(data.error || '❌ Не удалось выдать ссылку.', Keyboards.mainMenu());
                }
            } catch (e) {
                console.error('Request password reset error:', e);
                await ctx.reply('❌ Ошибка сервера. Попробуйте позже.', Keyboards.mainMenu());
            }
            return ctx.scene.leave();
        }
    }
);
