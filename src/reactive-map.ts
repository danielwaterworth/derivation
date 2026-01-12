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
    this._materialized = changes.accumulate(snapshot, (acc, x) => acc.union(x));
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

  get previousMaterialized(): ReactiveValue<ZMap<K, V>> {
    return this.previousStep;
  }

  union(other: ReactiveMap<K, V>): ReactiveMap<K, V> {
    return new ReactiveMap(
      this._changes.zip(other._changes, (x, y) => x.union(y)),
      this.previousSnapshot.union(other.previousSnapshot),
    );
  }

  join<V1>(other: ReactiveMap<K, V1>): ReactiveMap<K, Tuple<[V, V1]>> {
    return new ReactiveMap(
      this.changes.zip3(
        this.previousMaterialized,
        other.changes,
        other.previousMaterialized,
        (tC, tM, oC, oM) => {
          return tC.join(oM).union(tM.join(oC)).union(tC.join(oC));
        },
      ),
      this.previousSnapshot.join(other.previousSnapshot),
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

  getConst(key: K): ReactiveSet<V> {
    return new ReactiveSet<V>(
      this._changes.map((x) => x.get(key)),
      this.previousSnapshot.get(key),
    );
  }

  intersection(other: ReactiveMap<K, V>): ReactiveMap<K, V> {
    return new ReactiveMap(
      this.changes.zip3(
        this.previousMaterialized,
        other.changes,
        other.previousMaterialized,
        (tC, tM, oC, oM) => {
          return tC.intersection(oM).union(tM.intersection(oC)).union(tC.intersection(oC));
        },
      ),
      this.previousSnapshot.intersection(other.previousSnapshot),
    );
  }

  difference(other: ReactiveMap<K, V>): ReactiveMap<K, V> {
    return new ReactiveMap(
      this._changes.zip(other._changes, (x, y) => x.difference(y)),
      this.previousSnapshot.difference(other.previousSnapshot),
    );
  }

  filter(pred: (k: K, v: V) => boolean): ReactiveMap<K, V> {
    return new ReactiveMap<K, V>(
      this._changes.map((x) => x.filter(pred)),
      this.previousSnapshot.filter(pred),
    );
  }
}
