import { Heap } from "heap-js";
import { ReactiveValue } from "./streaming.js";

export class DirtySet {
  private readonly set = new Set<ReactiveValue<unknown>>();
  private readonly heap = new Heap<ReactiveValue<unknown>>((a, b) =>
    a.index.compare(b.index)
  );

  add(value: ReactiveValue<unknown>): void {
    if (!this.set.has(value)) {
      this.set.add(value);
      this.heap.push(value);
    }
  }

  pop(): ReactiveValue<unknown> | undefined {
    const value = this.heap.pop();
    if (value !== undefined) {
      this.set.delete(value);
    }
    return value;
  }

  has(value: ReactiveValue<unknown>): boolean {
    return this.set.has(value);
  }

  get size(): number {
    return this.set.size;
  }

  isEmpty(): boolean {
    return this.set.size === 0;
  }
}
