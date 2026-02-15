import { Heap } from "heap-js";
import { InternalReactiveValue } from "./streaming.js";

export class DirtySet {
  private readonly set = new Set<InternalReactiveValue<unknown>>();
  private heap = new Heap<InternalReactiveValue<unknown>>(
    (a, b) => a.height - b.height,
  );

  add(value: InternalReactiveValue<unknown>): void {
    if (!this.set.has(value)) {
      this.set.add(value);
      this.heap.push(value);
    }
  }

  rebuild(): void {
    const heap = new Heap<InternalReactiveValue<unknown>>(
      (a, b) => a.height - b.height,
    );
    for (const value of this.set) {
      heap.push(value);
    }
    this.heap = heap;
  }

  pop(): InternalReactiveValue<unknown> | undefined {
    const value = this.heap.pop();
    if (value !== undefined) {
      this.set.delete(value);
    }
    return value;
  }

  has(value: InternalReactiveValue<unknown>): boolean {
    return this.set.has(value);
  }

  delete(value: InternalReactiveValue<unknown>): void {
    this.set.delete(value);
  }

  get size(): number {
    return this.set.size;
  }

  isEmpty(): boolean {
    return this.set.size === 0;
  }
}
