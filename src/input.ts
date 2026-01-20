import { ReactiveValue, Graph } from "./streaming.js";

export class Input<T> extends ReactiveValue<T> {
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
  }

  step(): void {
    this.current = this.pending;
  }

  get value(): T {
    return this.current;
  }
}
