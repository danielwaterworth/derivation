import { List } from "@rimbu/core";
import { Coordinator } from "./streaming.js";
import { LogChangeInput } from "./log-change-input.js";
import { ReactiveLog } from "./reactive-log.js";

export class ReactiveLogSource<T> extends ReactiveLog<T> {
  private readonly input: LogChangeInput<T>;

  constructor(snapshot: List<T>, coordinator: Coordinator) {
    const input = new LogChangeInput<T>(coordinator);
    super(input, snapshot);
    this.input = input;
  }

  push(item: T): void {
    this.input.push(item);
  }

  pushAll(items: List<T>): void {
    this.input.pushAll(items);
  }
}
