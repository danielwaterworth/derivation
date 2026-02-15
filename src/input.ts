import { InternalReactiveValue, Graph } from "./streaming.js";

export class InternalInput<T> extends InternalReactiveValue<T> {
  private current: T;
  private pending: T;

  constructor(
    initial: T,
    public readonly graph: Graph,
  ) {
    super();
    this.current = initial;
    this.pending = initial;
    graph.addValue(this);
  }

  push(value: T): void {
    this.pending = value;
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    const oldValue = this.current;
    this.current = this.pending;
    if (oldValue !== this.current) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    this.assertNotDisposed();
    return this.current;
  }
}
