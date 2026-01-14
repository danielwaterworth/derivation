import { List } from "immutable";
import { Coordinator, ReactiveValue } from "./streaming.js";

export class LogChangeInput<T> extends ReactiveValue<List<T>> {
  private current: List<T> = List();
  private pending: List<T> = List();

  constructor(public readonly coordinator: Coordinator) {
    super();
    coordinator.addReactive(this);
  }

  push(item: T): void {
    this.pending = this.pending.push(item);
  }

  pushAll(items: List<T>): void {
    this.pending = this.pending.concat(items);
  }

  step(): void {
    this.current = this.pending;
    this.pending = List();
  }

  get value(): List<T> {
    return this.current;
  }
}
