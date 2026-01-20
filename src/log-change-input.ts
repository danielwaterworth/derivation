import { List } from "@rimbu/core";
import { Coordinator, ReactiveValue } from "./streaming.js";

export class LogChangeInput<T> extends ReactiveValue<List<T>> {
  private current: List<T> = List.empty();
  private pending: List<T> = List.empty();

  constructor(public readonly coordinator: Coordinator) {
    super();
    coordinator.addReactive(this);
  }

  push(item: T): void {
    this.pending = this.pending.append(item);
  }

  pushAll(items: List<T>): void {
    this.pending = this.pending.concat(items);
  }

  step(): void {
    this.current = this.pending;
    this.pending = List.empty();
  }

  get value(): List<T> {
    return this.current;
  }
}
