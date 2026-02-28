import { Telegraf, Context } from 'telegraf';
import crypto from 'crypto';
import { ApiClient } from '../api/apiClient';
import { Keyboards } from '../utils/keyboard';

interface Plan {
    id: number;
    days: number;
    price_usd: number;
    price_stars: number;
}

export const setupPayments = (bot: Telegraf<any>) => {
    bot.hears('🚀 Получить PREMIUM-подписку', async (ctx: Context) => {
        try {
            const { plans } = await ApiClient.get<{ ok: boolean; plans: Plan[] }>('/api/bot/plans');
            if (!plans || plans.length === 0) {
                await ctx.reply('⚠️ Тарифы временно недоступны. Попробуйте позже.');
                return;
            }
            await ctx.reply('🔥 Выберите подходящий тариф:', Keyboards.plansList(plans));
        } catch (e) {
            console.error('Plans fetch error:', e);
            await ctx.reply('❌ Ошибка загрузки тарифов. Сервер недоступен.');
        }
    });

    bot.action(/^plan_(\d+)_(\d+)_(\d+)$/, async (ctx: any) => {
        const planId = parseInt(ctx.match[1], 10);
        const days = parseInt(ctx.match[2], 10);
        const priceStars = parseInt(ctx.match[3], 10);
        const payload = JSON.stringify({ planId, days, priceStars });

        try {
            await ctx.answerCbQuery();
            await ctx.replyWithInvoice({
                title: `👑 PREMIUM на ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`,
                description: `Подписка на сайт CLABX на ${days} дн. После оплаты вы получите ключ активации.`,
                payload,
                provider_token: '', // Для Stars всегда пустой
                currency: 'XTR',
                prices: [{ label: 'Подписка', amount: priceStars }]
            });
        } catch (e) {
            console.error('Send invoice error:', e);
            await ctx.reply('❌ Не удалось создать счёт. Попробуйте позже.');
        }
    });

    bot.on('pre_checkout_query', async (ctx: Context) => {
        await ctx.answerPreCheckoutQuery(true);
    });

    bot.on('successful_payment', async (ctx: any) => {
        const msg = ctx.message;
        if (!msg?.successful_payment?.invoice_payload) return;

        let payload: { planId?: number; days?: number; priceStars?: number };
        try {
            payload = JSON.parse(msg.successful_payment.invoice_payload);
        } catch {
            await ctx.reply('❌ Ошибка обработки данных об оплате.');
            return;
        }

        const days = Math.max(1, payload.days || 30);
        const telegramUserId = String(ctx.from?.id ?? '');
        const key = crypto.randomBytes(16).toString('hex').toUpperCase();

        try {
            await ApiClient.post('/api/bot/register-key', {
                key,
                durationDays: days,
                telegramUserId
            });
            await ctx.reply(
                `🎉 Спасибо за покупку! Удачных сделок!\n\nВаш ключ активации:\n\`${key}\`\n\n📌 Введите его на сайте clabx.ru в разделе «Профиль» → «Добавить ключ».`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('Register key error:', e);
            await ctx.reply(
                `⚠️ Оплата прошла успешно, но не удалось зарегистрировать ключ на сайте. Обратитесь в техподдержку и сообщите номер платежа.`
            );
        }
    });
};
