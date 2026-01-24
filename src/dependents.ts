import { WeakList } from "./weak-list.js";

export class Dependents<T extends object> {
  private readonly weakMap = new WeakMap<T, void>();
  private readonly weakList = new WeakList<T>();

  add(value: T): void {
    if (!this.weakMap.has(value)) {
      this.weakMap.set(value, undefined);
      this.weakList.push(value);
    }
  }

  delete(value: T): void {
    this.weakMap.delete(value);
    // The weakList will clean up the dead reference during iteration
  }

  has(value: T): boolean {
    return this.weakMap.has(value);
  }

  *[Symbol.iterator](): Iterator<T> {
    for (const value of this.weakList) {
      // Only yield values still in the map (not deleted)
      if (this.weakMap.has(value)) {
        yield value;
      }
    }
  }
}
