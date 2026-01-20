import { ZSet } from "./z-set.js";
import { HashMap } from "@rimbu/core";
import { Tuple } from "./tuple.js";
import { emptyHashMap, hashMapFrom, hashMapBuilder } from "./rimbu-utils.js";

export type ZMapEntry<K, V> = readonly [k1: K, k2: V, weight: number];

export class ZMap<K, V> {
  private readonly entries: HashMap<K, ZSet<V>>;

  constructor(entries?: HashMap<K, ZSet<V>> | Iterable<readonly [K, ZSet<V>]>) {
    if (entries === undefined) {
      this.entries = emptyHashMap<K, ZSet<V>>();
    } else if (typeof (entries as any).toBuilder === 'function') {
      // It's a rimbu HashMap
      this.entries = entries as HashMap<K, ZSet<V>>;
    } else {
      this.entries = hashMapFrom<K, ZSet<V>>(entries);
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  get length(): number {
    let count = 0;
    for (const [, zset] of this.entries) {
      count += zset.length;
    }
    return count;
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
      const next = this.entries.removeKey(k1);
      return next === this.entries ? this : new ZMap(next);
    } else {
      const next = this.entries.set(k1, merged);
      return next === this.entries ? this : new ZMap(next);
    }
  }

  add(k1: K, k2: V, weight = 1): ZMap<K, V> {
    if (weight === 0) return this;

    const builder = this.entries.toBuilder();
    const current = builder.get(k1) ?? new ZSet<V>();
    const updated = current.add(k2, weight);

    if (updated.isEmpty()) builder.removeKey(k1);
    else builder.set(k1, updated);

    const next = builder.build();

    return next === this.entries ? this : new ZMap(next);
  }

  remove(k1: K, k2: V, weight = 1): ZMap<K, V> {
    return this.add(k1, k2, -weight);
  }

  union(other: ZMap<K, V>): ZMap<K, V> {
    if (other.entries.size === 0) return this;

    const builder = this.entries.toBuilder();
    for (const [k1, k2, w] of other.getEntries()) {
      if (w === 0) continue;

      const row = builder.get(k1) ?? new ZSet<V>();
      const updated = row.add(k2, w);

      if (updated.isEmpty()) builder.removeKey(k1);
      else builder.set(k1, updated);
    }
    const next = builder.build();

    return next === this.entries ? this : new ZMap(next);
  }

  intersection(other: ZMap<K, V>): ZMap<K, V> {
    let result = emptyHashMap<K, ZSet<V>>();

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

    const builder = this.entries.toBuilder();
    for (const [k1, k2, w] of other.getEntries()) {
      if (w === 0) continue;

      const row = builder.get(k1) ?? new ZSet<V>();
      const updated = row.add(k2, -w);

      if (updated.isEmpty()) builder.removeKey(k1);
      else builder.set(k1, updated);
    }
    const next = builder.build();

    return next === this.entries ? this : new ZMap(next);
  }

  filter(pred: (k: K, v: V) => boolean): ZMap<K, V> {
    const builder = hashMapBuilder<K, ZSet<V>>();
    for (const [k, zset] of this.entries) {
      const filtered = zset.filter((v) => pred(k, v));
      if (!filtered.isEmpty()) {
        builder.set(k, filtered);
      }
    }
    const next = builder.build();

    return new ZMap(next);
  }

  join<V1>(other: ZMap<K, V1>): ZMap<K, Tuple<[V, V1]>> {
    let result = emptyHashMap<K, ZSet<Tuple<[V, V1]>>>();

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
    const builder = hashMapBuilder<K, ZSet<V1>>();
    for (const [k, zset] of this.entries) {
      builder.set(k, zset.map(func));
    }
    const next = builder.build();
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
