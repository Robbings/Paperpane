export interface MarkdownUploadTask {
  readonly id: string;
  readonly owner: string;
  error?: string;
  retry(): Promise<void>;
  cancel(): void;
}

/** Each accepted upload owns its retry state, independently of the editor's other uploads. */
export class MarkdownUploadTasks {
  private tasks = new Map<string, MarkdownUploadTask>();
  private running = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private version = 0;
  private barriers = new Set<symbol>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.version;
  private changed() {
    this.version++;
    this.listeners.forEach((listener) => listener());
  }
  get blocked() {
    return this.barriers.size > 0;
  }
  /** Reject new uploads while accepted tasks finish for a document transition. */
  holdNewUploads() {
    const token = Symbol();
    this.barriers.add(token);
    this.changed();
    return () => {
      if (this.barriers.delete(token)) this.changed();
    };
  }
  get unsaved() {
    return this.tasks.size > 0;
  }
  has(id: string) {
    return this.tasks.has(id);
  }
  hasOwner(owner: string) {
    return [...this.tasks.values()].some(task => task.owner === owner);
  }
  firstFailure(owner: string) {
    return [...this.tasks.values()].find(
      (task) => task.owner === owner && task.error !== undefined,
    );
  }
  cancelOwner(owner: string) {
    for (const task of [...this.tasks.values()])
      if (task.owner === owner) task.cancel();
  }
  async settle() {
    // Include uploads accepted while an earlier batch was settling.
    while (this.running.size)
      await Promise.allSettled([...this.running.values()]);
    return !this.unsaved;
  }
  create(
    owner: string,
    run: (cancelled: () => boolean) => Promise<void>,
    onSettled: () => void,
  ) {
    if (this.blocked) throw new Error("正在切换论文，请稍后再插入图片。");
    let cancelled = false;
    const task: MarkdownUploadTask = {
      id: crypto.randomUUID(),
      owner,
      retry: () => {
        const active = this.running.get(task.id);
        if (active) return active;
        if (cancelled || !this.tasks.has(task.id)) return Promise.resolve();
        task.error = undefined;
        const promise = Promise.resolve()
          .then(() => (cancelled ? undefined : run(() => cancelled)))
          .then(() => {
            this.tasks.delete(task.id);
          })
          .catch((error) => {
            if (cancelled) return;
            task.error =
              error instanceof Error ? error.message : "图片保存失败";
            throw error;
          })
          .finally(() => {
            this.running.delete(task.id);
            if (cancelled) this.tasks.delete(task.id);
            this.changed();
            onSettled();
          });
        this.running.set(task.id, promise);
        this.changed();
        return promise;
      },
      cancel: () => {
        cancelled = true;
        task.error = undefined;
        // An in-flight write still owns its resources until it has settled.
        if (!this.running.has(task.id)) {
          this.tasks.delete(task.id);
          onSettled();
        }
        this.changed();
      },
    };
    this.tasks.set(task.id, task);
    this.changed();
    return task;
  }
}
