export async function retryTx<T>(fn: () => Promise<T>, retries = 3, delayMs = 2000): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      attempt += 1;
      if (attempt >= retries) break;
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('retryTx: failed after retries');
}
