import { Hasher, Eq, List, HashMap } from "@rimbu/core";
import { hash, is } from "immutable";

/**
 * Default hasher for use with ZSet and ZMap
 * Uses immutable.js's hash() function for consistent value-based hashing
 */
export const defaultHasher: Hasher<unknown> = {
  isValid: (_v): _v is unknown => true,
  hash: (value: unknown): number => hash(value),
};

/**
 * Default equality for use with ZSet and ZMap
 * Uses immutable.js's is() function for consistent value-based equality
 */
export const defaultEq: Eq<unknown> = (a: unknown, b: unknown): boolean =>
  is(a, b);

/**
 * Create a HashMap context using immutable.js's hash and equality
 */
export function createHashMapContext<K>() {
  return HashMap.createContext<K>({
    hasher: defaultHasher as Hasher<K>,
    eq: defaultEq as Eq<K>,
  });
}

/**
 * Create an empty HashMap with immutable-based hash/equality
 */
export function emptyHashMap<K, V>(): HashMap<K, V> {
  const ctx = createHashMapContext<K>();
  return ctx.empty<K, V>();
}

/**
 * Create a HashMap from entries with immutable-based hash/equality
 */
export function hashMapFrom<K, V>(
  entries: Iterable<readonly [K, V]>,
): HashMap<K, V> {
  const ctx = createHashMapContext<K>();
  return ctx.from<K, V>(entries);
}

/**
 * Create a HashMap builder with immutable-based hash/equality
 */
export function hashMapBuilder<K, V>(): HashMap.Builder<K, V> {
  const ctx = createHashMapContext<K>();
  return ctx.builder<K, V>();
}
