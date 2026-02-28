import { Markup } from 'telegraf';

export const Keyboards = {
    mainMenu: () => Markup.keyboard([
        ['🚀 Получить PREMIUM-подписку'],
        ['🔑 Зарегистрироваться на сайте', '🔄 Восстановить пароль']
    ]).resize(),

    cancel: () => Markup.keyboard([
        ['❌ Отмена']
    ]).resize(),

    plansList: (plans: { id: number; days: number; price_stars: number }[]) => {
        const buttons = plans.map(p =>
            Markup.button.callback(`⭐ ${p.days} дн. — ${p.price_stars} XTR`, `plan_${p.id}_${p.days}_${p.price_stars}`)
        );
        return Markup.inlineKeyboard(buttons.map(b => [b]));
    }
};
