import { Coordinator, ReactiveValue } from "./streaming";
import { ZMap } from "./z-map";

export class ZMapChangeInput<K, V> extends ReactiveValue<ZMap<K, V>> {
  private current = new ZMap<K, V>();
  private pending = new ZMap<K, V>();

  constructor(public readonly coordinator: Coordinator) {
    super();
    coordinator.addReactive(this);
  }

  add(k1: K, k2: V, weight = 1): void {
    this.pending = this.pending.add(k1, k2, weight);
  }

  push(set: ZMap<K, V>): void {
    this.pending = this.pending.union(set);
  }

  step(): void {
    this.current = this.pending;
    this.pending = new ZMap<K, V>();
  }

  get value(): ZMap<K, V> {
    return this.current;
  }
}
