import { Heap } from "heap-js";
import { ReactiveValue } from "./streaming.js";

export class DirtySet {
  private readonly set = new Set<ReactiveValue<unknown>>();
  private heap = new Heap<ReactiveValue<unknown>>((a, b) => a.height - b.height);

  add(value: ReactiveValue<unknown>): void {
    if (!this.set.has(value)) {
      this.set.add(value);
      this.heap.push(value);
    }
  }

  rebuild(): void {
    const heap = new Heap<ReactiveValue<unknown>>((a, b) => a.height - b.height);
    for (const value of this.set) {
      heap.push(value);
    }
    this.heap = heap;
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
