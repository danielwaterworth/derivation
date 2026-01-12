import { ZSet } from "./z-set";
import { Map as IMap } from "immutable";
import { Tuple } from "./tuple";

export type ZMapEntry<K, V> = readonly [k1: K, k2: V, weight: number];

export class ZMap<K, V> {
  private readonly entries: IMap<K, ZSet<V>>;

  constructor(entries?: IMap<K, ZSet<V>> | Iterable<readonly [K, ZSet<V>]>) {
    if (entries === undefined) {
      this.entries = IMap<K, ZSet<V>>();
    } else if (IMap.isMap(entries)) {
      this.entries = entries as IMap<K, ZSet<V>>;
    } else {
      this.entries = IMap<K, ZSet<V>>(entries as Iterable<[K, ZSet<V>]>);
    }
  }

  *getEntries(): IterableIterator<ZMapEntry<K, V>> {
    for (const [k1, zset] of this.entries) {
      for (const [k2, w] of zset.getEntries()) {
        yield [k1, k2, w] as const;
      }
    }
  }

  get(k1: K): ZSet<V> {
    return this.entries.get(k1) ?? new ZSet<V>();
  }

  getValue(k1: K, k2: V): number {
    return this.get(k1).get(k2);
  }

  addSet(k1: K, zset: ZSet<V>): ZMap<K, V> {
    if (zset.isEmpty()) return this;

    const existing = this.entries.get(k1);
    const merged = existing ? zset.union(existing) : zset;

    if (merged.isEmpty()) {
      const next = this.entries.remove(k1);
      return next === this.entries ? this : new ZMap(next);
    } else {
      const next = this.entries.set(k1, merged);
      return next === this.entries ? this : new ZMap(next);
    }
  }

  add(k1: K, k2: V, weight = 1): ZMap<K, V> {
    if (weight === 0) return this;

    const next = this.entries.withMutations((m) => {
      const current = m.get(k1) ?? new ZSet<V>();
      const updated = current.add(k2, weight);

      if (updated.isEmpty()) m.remove(k1);
      else m.set(k1, updated);
    });

    return next === this.entries ? this : new ZMap(next);
  }

  remove(k1: K, k2: V, weight = 1): ZMap<K, V> {
    return this.add(k1, k2, -weight);
  }

  union(other: ZMap<K, V>): ZMap<K, V> {
    if (other.entries.size === 0) return this;

    const next = this.entries.withMutations((m) => {
      for (const [k1, k2, w] of other.getEntries()) {
        if (w === 0) continue;

        const row = m.get(k1) ?? new ZSet<V>();
        const updated = row.add(k2, w);

        if (updated.isEmpty()) m.remove(k1);
        else m.set(k1, updated);
      }
    });

    return next === this.entries ? this : new ZMap(next);
  }

  intersection(other: ZMap<K, V>): ZMap<K, V> {
    let result = IMap<K, ZSet<V>>();

    for (const [k, left] of this.entries) {
      const right = other.entries.get(k);
      if (right) {
        const intersected = left.intersection(right);
        if (!intersected.isEmpty()) {
          result = result.set(k, intersected);
        }
      }
    }

    return new ZMap(result);
  }

  difference(other: ZMap<K, V>): ZMap<K, V> {
    if (other.entries.size === 0) return this;

    const next = this.entries.withMutations((m) => {
      for (const [k1, k2, w] of other.getEntries()) {
        if (w === 0) continue;

        const row = m.get(k1) ?? new ZSet<V>();
        const updated = row.add(k2, -w);

        if (updated.isEmpty()) m.remove(k1);
        else m.set(k1, updated);
      }
    });

    return next === this.entries ? this : new ZMap(next);
  }

  filter(pred: (k: K, v: V) => boolean): ZMap<K, V> {
    const next = this.entries.withMutations((m) => {
      m.clear();
      for (const [k, zset] of this.entries) {
        const filtered = zset.filter((v) => pred(k, v));
        if (!filtered.isEmpty()) {
          m.set(k, filtered);
        }
      }
    });

    return new ZMap(next);
  }

  join<V1>(other: ZMap<K, V1>): ZMap<K, Tuple<[V, V1]>> {
    let result = IMap<K, ZSet<Tuple<[V, V1]>>>();

    for (const [k, left] of this.entries) {
      const right = other.entries.get(k);
      if (right) {
        const prod = left.product(right);
        if (!prod.isEmpty()) result = result.set(k, prod);
      }
    }

    return new ZMap(result);
  }

  mapValues<V1>(func: (v: V) => V1): ZMap<K, V1> {
    const next = this.entries.map((z) => z.map(func)) as unknown as IMap<
      K,
      ZSet<V1>
    >;
    return new ZMap(next);
  }

  flatten(): ZSet<V> {
    let acc = new ZSet<V>();
    for (const [, row] of this.entries) {
      acc = acc.union(row);
    }
    return acc;
  }

  toArray(): ZMapEntry<K, V>[] {
    return [...this.getEntries()];
  }
}
