/**
 * API v1 — все роуты под /api/v1 (и /api для обратной совместимости).
 */

import { Router } from 'express';
import signalsRouter from '../signals';
import marketRouter from '../market';
import mlRouter from '../ml';
import connectionsRouter from '../connections';
import notifyRouter from '../notify';
import scannerRouter from '../scanner';
import tradingRouter from '../trading';
import backtestRouter from '../backtest';
import ordersRouter from '../orders';
import authRouter from '../auth';
import statsRouter from '../stats';
import adminRouter from '../admin';
import botRouter from '../bot';
import copyTradingRouter from '../copyTrading';
import socialRouter from '../social';
import walletRouter from '../wallet';
import userModeRouter from '../userMode';
import copyTradingApiRouter from '../copyTradingApi';
import newsRouter from '../news';
import { rateLimit } from '../../middleware/rateLimit';

const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const signalsRateLimit = rateLimit({ windowMs: 60 * 1000, max: 120 });

const v1Router = Router();

v1Router.use('/signals', signalsRateLimit, signalsRouter);
v1Router.use('/market', marketRouter);
v1Router.use('/ml', mlRouter);
v1Router.use('/connections', connectionsRouter);
v1Router.use('/notify', notifyRouter);
v1Router.use('/scanner', scannerRouter);
v1Router.use('/trading', tradingRouter);
v1Router.use('/backtest', backtestRouter);
v1Router.use('/orders', ordersRouter);
v1Router.use('/auth', authRateLimit, authRouter);
v1Router.use('/stats', statsRouter);
v1Router.use('/admin', adminRouter);
v1Router.use('/bot', botRouter);
v1Router.use('/copy-trading', copyTradingRouter);
v1Router.use('/social', socialRouter);
v1Router.use('/wallet', walletRouter);
v1Router.use('/user/mode', userModeRouter);
v1Router.use('/copy-trading-api', copyTradingApiRouter);
v1Router.use('/news', newsRouter);

export default v1Router;
