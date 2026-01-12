import { Coordinator } from "./streaming.js";
import { ZMapChangeInput } from "./z-map-change-input.js";
import { ReactiveMap } from "./reactive-map.js";
import { ZMap } from "./z-map.js";

export class ReactiveMapSource<K, V> extends ReactiveMap<K, V> {
  private readonly input: ZMapChangeInput<K, V>;

  constructor(snapshot: ZMap<K, V>, coordinator: Coordinator) {
    const input = new ZMapChangeInput<K, V>(coordinator);
    super(input, snapshot);
    this.input = input;
  }

  add(k1: K, k2: V, weight = 1): void {
    this.input.add(k1, k2, weight);
  }

  push(set: ZMap<K, V>): void {
    this.input.push(set);
  }
}
