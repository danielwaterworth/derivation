import { ReactiveValue, Coordinator } from "./streaming.js";

export class Input<T> extends ReactiveValue<T> {
  private current: T;
  private pending: T;

  constructor(
    initial: T,
    public readonly coordinator: Coordinator,
  ) {
    super();
    this.current = initial;
    this.pending = initial;
    coordinator.addReactive(this);
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
