import { ZMap } from "./z-map.js";
import { Map as IMap } from "immutable";
import { Tuple } from "./tuple.js";

export type ZSetEntry<T> = readonly [item: T, weight: number];

export class ZSet<T> {
  private readonly entries: IMap<T, number>;

  constructor(entries?: IMap<T, number> | Iterable<readonly [T, number]>) {
    if (entries === undefined) {
      this.entries = IMap<T, number>();
    } else if (IMap.isMap(entries)) {
      this.entries = entries as IMap<T, number>;
    } else {
      this.entries = IMap<T, number>(entries as Iterable<[T, number]>);
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
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

    const next = this.entries.update(item, 0, (cur) => {
      const updated = cur + weight;
      return updated;
    });

    const cleaned = next.get(item) === 0 ? next.remove(item) : next;

    return cleaned === this.entries ? this : new ZSet(cleaned);
  }

  remove(item: T, weight = 1): ZSet<T> {
    return this.add(item, -weight);
  }

  union(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    const next = this.entries.withMutations((m) => {
      for (const [item, w] of other.entries) {
        if (w === 0) continue;

        const cur = m.get(item) ?? 0;
        const updated = cur + w;

        if (updated === 0) m.remove(item);
        else m.set(item, updated);
      }
    });

    return next === this.entries ? this : new ZSet(next);
  }

  intersection(other: ZSet<T>): ZSet<T> {
    if (this.entries.size === 0 || other.entries.size === 0) return new ZSet<T>();

    const next = this.entries.withMutations((m) => {
      m.clear();
      for (const [item, weight1] of this.entries) {
        const weight2 = other.entries.get(item);
        if (weight2 !== undefined) {
          const product = weight1 * weight2;
          if (product !== 0) m.set(item, product);
        }
      }
    });

    return new ZSet(next);
  }

  difference(other: ZSet<T>): ZSet<T> {
    if (other.entries.size === 0) return this;

    const next = this.entries.withMutations((m) => {
      for (const [item, weight] of other.entries) {
        const current = m.get(item);
        if (current !== undefined) {
          const diff = current - weight;
          if (diff === 0) m.remove(item);
          else m.set(item, diff);
        } else if (weight !== 0) {
          m.set(item, -weight);
        }
      }
    });

    return next === this.entries ? this : new ZSet(next);
  }

  filter(pred: (t: T) => boolean): ZSet<T> {
    const next = this.entries.withMutations((m) => {
      m.clear();
      for (const [item, weight] of this.entries) {
        if (pred(item)) {
          m.set(item, weight);
        }
      }
    });

    return next.size === this.entries.size ? this : new ZSet(next);
  }

  product<A>(other: ZSet<A>): ZSet<Tuple<[T, A]>> {
    let result = IMap<Tuple<[T, A]>, number>();

    for (const [xItem, xWeight] of this.entries) {
      for (const [yItem, yWeight] of other.entries) {
        const w = xWeight * yWeight;
        if (w === 0) continue;

        const key = Tuple(xItem, yItem);
        const prev = result.get(key) ?? 0;
        const upd = prev + w;

        result = upd === 0 ? result.remove(key) : result.set(key, upd);
      }
    }

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
