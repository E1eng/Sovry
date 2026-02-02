import { EventEmitter } from 'events';

class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];
  private emitter = new EventEmitter();

  async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const releaseListener = () => {
        this.emitter.removeListener('release', releaseListener);
        resolve();
      };
      this.emitter.on('release', releaseListener);
      this.queue.push(releaseListener);
    });
  }

  private release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.locked = false;
      this.emitter.emit('release');
    }
  }
}

export const txMutex = new Mutex();
export default Mutex;
