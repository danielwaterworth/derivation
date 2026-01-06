import { Coordinator, ReactiveValue } from "./streaming";
import { ZSet } from "./z-set";

export class ZSetChangeInput<T> extends ReactiveValue<ZSet<T>> {
  private current = new ZSet<T>();
  private pending = new ZSet<T>();

  constructor(public readonly coordinator: Coordinator) {
    super();
    coordinator.addReactive(this);
  }

  add(item: T, weight = 1): void {
    this.pending = this.pending.add(item, weight);
  }

  push(set: ZSet<T>): void {
    this.pending = this.pending.union(set);
  }

  step(): void {
    this.current = this.pending;
    this.pending = new ZSet<T>();
  }

  get value(): ZSet<T> {
    return this.current;
  }
}
