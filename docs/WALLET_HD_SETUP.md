# HD Wallet (BIP44) — настройка кошелька для приёма USDT

Реализация по **Способу 2**: BIP44 / HD Wallets — один главный кошелёк (seed-фраза), для каждого пользователя — производный адрес. Trust Wallet видит все средства.

## Как это работает

1. **Seed-фраза** — 12 или 24 слова. Храните в надёжном месте.
2. **Производные адреса** — `m/44'/60'/0'/0/{index}`. User 0 → index 0, User 1 → index 1 и т.д.
3. **Trust Wallet** — импортируете эту seed-фразу — видите все USDT на всех адресах.
4. **Сканер** — каждые 60 сек проверяет блокчейн на входящие USDT и начисляет баланс.

## Настройка

### 1. Создание seed-фразы

```bash
# Вариант: сгенерировать через Node.js
node -e "const { HDNodeWallet } = require('ethers'); const w = HDNodeWallet.createRandom(); console.log(w.mnemonic?.phrase);"
```

Сохраните фразу в надёжном месте. Никому не передавайте.

### 2. Переменные окружения (backend/.env)

```env
# HD Wallet — BIP44
HD_WALLET_MNEMONIC="word1 word2 word3 ... word12"
HD_WALLET_CHAIN=bsc
HD_WALLET_RPC=https://bsc-dataseed.binance.org
```

- **HD_WALLET_MNEMONIC** — ваша seed-фраза (12 или 24 слова).
- **HD_WALLET_CHAIN** — `bsc` (BNB Smart Chain) или `eth` (Ethereum).
- **HD_WALLET_RPC** — RPC-узлы. По умолчанию: BSC или ETH.

### 3. Trust Wallet

1. Создайте или импортируйте кошелёк.
2. Импортируйте seed-фразу (Recovery Phrase).
3. Добавьте сеть BNB Smart Chain (если `HD_WALLET_CHAIN=bsc`).
4. Все средства, поступившие на производные адреса, будут видны в Trust Wallet.

## API

- `GET /api/wallet/balance` — баланс пользователя (USDT).
- `GET /api/wallet/deposit-address` — уникальный адрес для пополнения.
- `POST /api/wallet/withdraw` — вывод USDT на указанный адрес.

## Безопасность

- Seed-фраза хранится только в `.env` на сервере. Не коммитить в git.
- Выводы подписываются на сервере. Доступ к seed = полный контроль над средствами.
- Рекомендуется использовать отдельный сервер/контейнер для подписания транзакций.
