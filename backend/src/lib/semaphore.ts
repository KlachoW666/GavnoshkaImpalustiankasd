/**
 * Simple async semaphore for limiting concurrency.
 * Usage: const sem = new Semaphore(5); await sem.acquire(); try { ... } finally { sem.release(); }
 */
export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;

  constructor(private readonly maxConcurrency: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  /** Run fn with automatic acquire/release */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
