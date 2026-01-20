import { ZMap } from "./z-map.js";
import { HashMap } from "@rimbu/core";
import { Tuple } from "./tuple.js";
import { emptyHashMap, hashMapFrom, hashMapBuilder } from "./rimbu-utils.js";

export type ZSetEntry<T> = readonly [item: T, weight: number];

export class ZSet<T> {
  private readonly entries: HashMap<T, number>;

  constructor(entries?: HashMap<T, number> | Iterable<readonly [T, number]>) {
    if (entries === undefined) {
      this.entries = emptyHashMap<T, number>();
    } else if (typeof (entries as any).toBuilder === "function") {
      // It's a rimbu HashMap
      this.entries = entries as HashMap<T, number>;
    } else {
      this.entries = hashMapFrom<T, number>(entries);
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  get length(): number {
    return this.entries.size;
  }

  get(item: T): number {
    return this.entries.get(item) ?? 0;
  }

  *getEntries(): IterableIterator<ZSetEntry<T>> {
    for (const [item, weight] of this.entries) {
      yield [item, weight] as const;
    }
  }

  add(item: T, weight = 1): ZSet<T> {
    if (weight === 0) return this;

    const cur = this.entries.get(item) ?? 0;
    const updated = cur + weight;

    const next =
      updated === 0
        ? this.entries.removeKey(item)
        : this.entries.set(item, updated);

    return next === this.entries ? this : new ZSet(next);
  }

  remove(item: T, weight = 1): ZSet<T> {
    return this.add(item, -weight);
  }

  union(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    const builder = this.entries.toBuilder();
    for (const [item, w] of other.entries) {
      if (w === 0) continue;

      const cur = builder.get(item) ?? 0;
      const updated = cur + w;

      if (updated === 0) builder.removeKey(item);
      else builder.set(item, updated);
    }
    const next = builder.build();

    return next === this.entries ? this : new ZSet(next);
  }

  intersection(other: ZSet<T>): ZSet<T> {
    if (this.entries.size === 0 || other.entries.size === 0)
      return new ZSet<T>();

    const builder = hashMapBuilder<T, number>();
    for (const [item, weight1] of this.entries) {
      const weight2 = other.entries.get(item);
      if (weight2 !== undefined) {
        const product = weight1 * weight2;
        if (product !== 0) builder.set(item, product);
      }
    }
    const next = builder.build();

    return new ZSet(next);
  }

  difference(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    const builder = this.entries.toBuilder();
    for (const [item, weight] of other.entries) {
      const current = builder.get(item);
      if (current !== undefined) {
        const diff = current - weight;
        if (diff === 0) builder.removeKey(item);
        else builder.set(item, diff);
      } else if (weight !== 0) {
        builder.set(item, -weight);
      }
    }
    const next = builder.build();

    return next === this.entries ? this : new ZSet(next);
  }

  filter(pred: (t: T) => boolean): ZSet<T> {
    const builder = hashMapBuilder<T, number>();
    for (const [item, weight] of this.entries) {
      if (pred(item)) {
        builder.set(item, weight);
      }
    }
    const next = builder.build();

    return next.size === this.entries.size ? this : new ZSet(next);
  }

  product<A>(other: ZSet<A>): ZSet<Tuple<[T, A]>> {
    const builder = hashMapBuilder<Tuple<[T, A]>, number>();

    for (const [xItem, xWeight] of this.entries) {
      for (const [yItem, yWeight] of other.entries) {
        const w = xWeight * yWeight;
        if (w === 0) continue;

        const key = Tuple(xItem, yItem);
        const prev = builder.get(key);
        const upd = (prev ?? 0) + w;

        if (upd === 0) builder.removeKey(key);
        else builder.set(key, upd);
      }
    }

    const result = builder.build();
    return new ZSet(result);
  }

  groupBy<K>(func: (t: T) => K): ZMap<K, T> {
    let result = new ZMap<K, T>();

    for (const [item, weight] of this.entries) {
      result = result.add(func(item), item, weight);
    }

    return result;
  }

  map<A>(func: (t: T) => A): ZSet<A> {
    let result = new ZSet<A>();

    for (const [item, weight] of this.entries) {
      result = result.add(func(item), weight);
    }

    return result;
  }

  toString(): string {
    return `ZSet(${this.entries.size})`;
  }

  toArray(): ZSetEntry<T>[] {
    return [...this.getEntries()];
  }
}
