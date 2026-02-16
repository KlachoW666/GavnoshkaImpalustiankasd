import { describe, it, expect } from 'vitest';
import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('allows up to maxConcurrency parallel tasks', async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await sem.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);
  });

  it('run() auto-releases on success', async () => {
    const sem = new Semaphore(1);
    const result = await sem.run(async () => 42);
    expect(result).toBe(42);
    // Verify semaphore is released by acquiring again immediately
    let acquired = false;
    await sem.acquire();
    acquired = true;
    sem.release();
    expect(acquired).toBe(true);
  });

  it('run() auto-releases on error', async () => {
    const sem = new Semaphore(1);
    await expect(sem.run(async () => { throw new Error('fail'); })).rejects.toThrow('fail');
    // Semaphore should be released
    let acquired = false;
    await sem.acquire();
    acquired = true;
    sem.release();
    expect(acquired).toBe(true);
  });

  it('queues tasks beyond concurrency limit', async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    const task = (id: number) => sem.run(async () => {
      order.push(id);
      await new Promise((r) => setTimeout(r, 10));
    });

    await Promise.all([task(1), task(2), task(3)]);
    expect(order).toEqual([1, 2, 3]);
  });
});
