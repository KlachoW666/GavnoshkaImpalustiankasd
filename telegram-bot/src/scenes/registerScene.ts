import { Scenes } from 'telegraf';
import { ApiClient } from '../api/apiClient';
import { Keyboards } from '../utils/keyboard';

// Wizard для регистрации
export const registerScene = new Scenes.WizardScene(
    'REGISTER_SCENE',
    async (ctx) => {
        await ctx.reply(
            '🌟 Введите желаемый логин для сайта clabx.ru (от 2 символов):',
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
            if (username.length < 2) {
                await ctx.reply('⚠️ Логин должен быть от 2 символов. Попробуйте снова или нажмите «Отмена».');
                return;
            }

            try {
                const telegramUserId = String(ctx.from?.id ?? '');
                const data = await ApiClient.post<{ ok: boolean; registerUrl?: string; error?: string }>(
                    '/api/bot/create-register-token',
                    { telegramUserId, usernameSuggestion: username }
                );

                if (data.ok && data.registerUrl) {
                    await ctx.reply(
                        `✅ Успешно!\n\n🔗 Ссылка для регистрации (действует 15 минут):\n\n${data.registerUrl}\n\nОткройте ссылку, придумайте пароль и примите правила. Аккаунт будет привязан к этому Telegram.`,
                        Keyboards.mainMenu()
                    );
                } else {
                    await ctx.reply(data.error || '❌ Не удалось создать ссылку. Попробуйте позже.', Keyboards.mainMenu());
                }
            } catch (e) {
                console.error('Create register token error:', e);
                await ctx.reply('❌ Ошибка сервера. Убедитесь, что сайт запущен, и попробуйте позже.', Keyboards.mainMenu());
            }
            return ctx.scene.leave();
        }
    }
);
