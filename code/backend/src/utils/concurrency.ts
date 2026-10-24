/**
 * In-memory concurrency and active-ride coordinator (Task 40).
 * Provides keyed mutex locks for serializing concurrent requests on critical resources:
 * - passenger:<passengerId> (ride request concurrency guard)
 * - ride:<rideId> (ride state transition coordination)
 * - driver:<driverId> (atomic assignment lock)
 */
export class ConcurrencyCoordinator {
  private activeLocks: Map<string, Promise<unknown>> = new Map();

  /**
   * Acquire a keyed lock and execute the provided async action safely.
   * If a lock for this key is already held, subsequent callers wait for
   * the previous promise to settle before executing.
   */
  async withLock<T>(key: string, action: () => Promise<T>): Promise<T> {
    const currentPromise = this.activeLocks.get(key) || Promise.resolve();

    let releaseLock: () => void;
    const nextPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Chain the new lock after the current lock settles (regardless of success or failure)
    const chainedExecution = currentPromise
      .catch(() => {})
      .then(async () => {
        try {
          return await action();
        } finally {
          releaseLock();
          if (this.activeLocks.get(key) === chainedExecution) {
            this.activeLocks.delete(key);
          }
        }
      });

    this.activeLocks.set(key, chainedExecution);
    return chainedExecution as Promise<T>;
  }

  /**
   * Check if a resource key is currently locked
   */
  isLocked(key: string): boolean {
    return this.activeLocks.has(key);
  }

  /**
   * Total number of active locks
   */
  activeLockCount(): number {
    return this.activeLocks.size;
  }

  /**
   * Clear all active locks (useful in test cleanup)
   */
  clear(): void {
    this.activeLocks.clear();
  }
}

export const concurrencyCoordinator = new ConcurrencyCoordinator();
