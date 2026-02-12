/**
 * Telegram-бот CLABX: меню, тарифы, оплата Stars, регистрация ключа на сайте.
 * Запуск: TELEGRAM_BOT_TOKEN и BOT_WEBHOOK_SECRET, API_BASE_URL в .env (или backend/.env).
 */

import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Telegraf, Markup } from 'telegraf';

// Загрузка .env: из корня проекта (PM2) или из telegram-bot
const cwd = process.cwd();
const backendEnv = path.join(cwd, 'backend', '.env');
const localEnv = path.join(cwd, '.env');
if (fs.existsSync(backendEnv)) dotenv.config({ path: backendEnv });
else if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv });
else dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const BOT_WEBHOOK_SECRET = process.env.BOT_WEBHOOK_SECRET || '';
const API_BASE_URL = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

if (!TELEGRAM_BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN не задан. Добавьте в backend/.env');
  process.exit(1);
}
if (!BOT_WEBHOOK_SECRET) {
  console.error('BOT_WEBHOOK_SECRET не задан. Добавьте в backend/.env');
  process.exit(1);
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'X-Bot-Token': BOT_WEBHOOK_SECRET }
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: object): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Bot-Token': BOT_WEBHOOK_SECRET
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

interface Plan {
  id: number;
  days: number;
  price_usd: number;
  price_stars: number;
  discount_percent?: number;
  enabled?: number;
  sort_order?: number;
}

function generateKey(): string {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Состояние ожидания ввода (по chat.id) — без session middleware
const chatState = new Map<number, 'register_username' | 'reset_username'>();

const MAIN_MENU = Markup.keyboard([
  ['Получить PREMIUM-подписку'],
  ['Зарегистрироваться на сайте', 'Восстановить пароль']
]).resize();

bot.start(async (ctx) => {
  await ctx.reply(
    'Добро пожаловать в CLABX 🚀\n\n' +
    '• Оформите PREMIUM-подписку на сайт clabx.ru\n' +
    '• Зарегистрируйтесь на сайте через бота (безопасно, синхронизация с ключами)\n' +
    '• Восстановите пароль, если аккаунт привязан к этому Telegram',
    MAIN_MENU
  );
});

bot.hears('Зарегистрироваться на сайте', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId) chatState.set(chatId, 'register_username');
  await ctx.reply('Введите желаемый логин для сайта clabx.ru (от 2 символов):');
});

bot.on('text', async (ctx, next) => {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return next();
  const state = chatState.get(chatId);
  if (state === 'register_username') {
    chatState.delete(chatId);
    const username = (ctx.message as any).text?.trim() || '';
    if (username.length < 2) {
      await ctx.reply('Логин должен быть от 2 символов. Попробуйте снова или нажмите «Получить PREMIUM-подписку».', MAIN_MENU);
      return;
    }
    try {
      const telegramUserId = String(ctx.from?.id ?? '');
      const data = await apiPost<{ ok: boolean; registerUrl?: string; error?: string }>('/api/bot/create-register-token', {
        telegramUserId,
        usernameSuggestion: username
      });
      if (data.ok && data.registerUrl) {
        await ctx.reply(
          `Ссылка для регистрации (действует 15 минут):\n\n${data.registerUrl}\n\nОткройте ссылку, придумайте пароль и примите правила. Аккаунт будет привязан к этому Telegram.`,
          MAIN_MENU
        );
      } else {
        await ctx.reply((data as any).error || 'Не удалось создать ссылку. Попробуйте позже.', MAIN_MENU);
      }
    } catch (e) {
      console.error('Create register token error:', e);
      await ctx.reply('Ошибка сервера. Убедитесь, что сайт запущен, и попробуйте позже.', MAIN_MENU);
    }
    return;
  }
  if (state === 'reset_username') {
    chatState.delete(chatId);
    const username = (ctx.message as any).text?.trim() || '';
    if (!username) {
      await ctx.reply('Введите логин от аккаунта на clabx.ru:', MAIN_MENU);
      return;
    }
    try {
      const telegramUserId = String(ctx.from?.id ?? '');
      const data = await apiPost<{ ok: boolean; resetUrl?: string; error?: string }>('/api/bot/request-password-reset', {
        telegramUserId,
        username
      });
      if (data.ok && data.resetUrl) {
        await ctx.reply(
          `Ссылка для сброса пароля (действует 15 минут):\n\n${data.resetUrl}\n\nОткройте ссылку и задайте новый пароль.`,
          MAIN_MENU
        );
      } else {
        await ctx.reply((data as any).error || 'Не удалось выдать ссылку.', MAIN_MENU);
      }
    } catch (e) {
      console.error('Request password reset error:', e);
      await ctx.reply('Ошибка сервера. Попробуйте позже.', MAIN_MENU);
    }
    return;
  }
  return next();
});

bot.hears('Восстановить пароль', async (ctx) => {
  const chatId = ctx.chat?.id;
  if (chatId) chatState.set(chatId, 'reset_username');
  await ctx.reply('Введите логин от вашего аккаунта на clabx.ru (аккаунт должен быть привязан к этому Telegram):');
});

bot.hears('Получить PREMIUM-подписку', async (ctx) => {
  try {
    const { plans } = await apiGet<{ ok: boolean; plans: Plan[] }>('/api/bot/plans');
    if (!plans || plans.length === 0) {
      await ctx.reply('Тарифы временно недоступны. Попробуйте позже.');
      return;
    }
    const buttons = plans.map((p) =>
      Markup.button.callback(`${p.days} дн. — ${p.price_stars} ⭐`, `plan_${p.id}_${p.days}_${p.price_stars}`)
    );
    await ctx.reply('Выберите тариф:', Markup.inlineKeyboard(buttons.map((b) => [b])));
  } catch (e) {
    console.error('Plans fetch error:', e);
    await ctx.reply('Ошибка загрузки тарифов. Проверьте, что сайт запущен и BOT_WEBHOOK_SECRET совпадает.');
  }
});

bot.action(/^plan_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
  const planId = parseInt(ctx.match[1], 10);
  const days = parseInt(ctx.match[2], 10);
  const priceStars = parseInt(ctx.match[3], 10);
  const payload = JSON.stringify({ planId, days, priceStars });
  try {
    // Telegram Stars: currency XTR, provider_token пустой для digital goods
    await ctx.answerCbQuery();
    await ctx.replyWithInvoice({
      title: `PREMIUM на ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`,
      description: `Подписка на сайт CLABX на ${days} дн. После оплаты вы получите ключ активации.`,
      payload,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Подписка', amount: priceStars }]
    });
  } catch (e) {
    console.error('Send invoice error:', e);
    await ctx.reply('Не удалось создать счёт. Попробуйте позже.');
  }
});

bot.on('pre_checkout_query', async (ctx) => {
  await ctx.answerPreCheckoutQuery(true);
});

bot.on('successful_payment', async (ctx) => {
  const msg = ctx.message;
  if (!msg?.successful_payment?.invoice_payload) return;
  let payload: { planId?: number; days?: number; priceStars?: number };
  try {
    payload = JSON.parse(msg.successful_payment.invoice_payload);
  } catch {
    await ctx.reply('Ошибка обработки оплаты.');
    return;
  }
  const days = Math.max(1, payload.days || 30);
  const telegramUserId = String(ctx.from?.id ?? '');
  const key = generateKey();
  try {
    await apiPost('/api/bot/register-key', {
      key,
      durationDays: days,
      telegramUserId
    });
    await ctx.reply(
      `Спасибо за покупку, удачных сделок!!!\n\nВаш ключ активации:\n\`${key}\`\n\nВведите его на сайте clabx.ru в разделе «Профиль» → «Добавить ключ».`,
      { parse_mode: 'Markdown' }
    );
  } catch (e) {
    console.error('Register key error:', e);
    await ctx.reply(
      `Оплата прошла, но не удалось зарегистрировать ключ на сайте. Обратитесь в поддержку и сообщите номер платежа.`
    );
  }
});

bot.catch((err, ctx) => {
  console.error('Bot error', err);
});

async function main() {
  await bot.launch();
  console.log('CLABX Telegram bot started');
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
