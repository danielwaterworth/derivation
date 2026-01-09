import { ReactiveValue } from "./streaming";
import { ZMap } from "./z-map";
import { ReactiveSet } from "./reactive-set";
import { Tuple } from "./tuple";

export class ReactiveMap<K, V> {
  private readonly _materialized: ReactiveValue<ZMap<K, V>>;
  private readonly previousStep: ReactiveValue<ZMap<K, V>>;
  private readonly _changes: ReactiveValue<ZMap<K, V>>;

  constructor(changes: ReactiveValue<ZMap<K, V>>, snapshot?: ZMap<K, V>) {
    snapshot = snapshot ?? new ZMap<K, V>();
    this._changes = changes;

    this._materialized = changes.accumulate(snapshot, (acc, x) => {
      return acc.union(x);
    });

    this.previousStep = this._materialized.delay(snapshot);
  }

  get previousSnapshot(): ZMap<K, V> {
    return this.previousStep.value;
  }

  get snapshot(): ZMap<K, V> {
    return this._materialized.value;
  }

  get changes(): ReactiveValue<ZMap<K, V>> {
    return this._changes;
  }

  get materialized(): ReactiveValue<ZMap<K, V>> {
    return this._materialized;
  }

  join<V1>(other: ReactiveMap<K, V1>): ReactiveMap<K, Tuple<[V, V1]>> {
    return new ReactiveMap(
      this._changes.zip(other._changes, (x, y) => x.join(y)),
      this.previousSnapshot.join(other.snapshot),
    );
  }

  mapValues<V1>(func: (v: V) => V1): ReactiveMap<K, V1> {
    return new ReactiveMap<K, V1>(
      this._changes.map((x) => x.mapValues(func)),
      this.previousSnapshot.mapValues(func),
    );
  }

  flatten(): ReactiveSet<V> {
    return new ReactiveSet<V>(
      this._changes.map((x) => x.flatten()),
      this.previousSnapshot.flatten(),
    );
  }
}
