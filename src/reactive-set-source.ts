import { Coordinator } from "./streaming.js";
import { ZSetChangeInput } from "./z-set-change-input.js";
import { ReactiveSet } from "./reactive-set.js";
import { ZSet } from "./z-set.js";

export class ReactiveSetSource<K> extends ReactiveSet<K> {
  private readonly input: ZSetChangeInput<K>;

  constructor(snapshot: ZSet<K>, coordinator: Coordinator) {
    const input = new ZSetChangeInput<K>(coordinator);
    super(input, snapshot);
    this.input = input;
  }

  add(k: K, weight = 1): void {
    this.input.add(k, weight);
  }

  push(set: ZSet<K>): void {
    this.input.push(set);
  }
}
