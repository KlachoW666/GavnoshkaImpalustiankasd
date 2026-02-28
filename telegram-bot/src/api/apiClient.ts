import { config } from '../config';

export class ApiClient {
    static async get<T>(path: string): Promise<T> {
        const res = await fetch(`${config.API_BASE_URL}${path}`, {
            headers: { 'X-Bot-Token': config.BOT_WEBHOOK_SECRET }
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API GET Error ${res.status}: ${text}`);
        }

        return res.json() as Promise<T>;
    }

    static async post<T>(path: string, body: object): Promise<T> {
        const res = await fetch(`${config.API_BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Bot-Token': config.BOT_WEBHOOK_SECRET
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API POST Error ${res.status}: ${text}`);
        }

        return res.json() as Promise<T>;
    }
}
