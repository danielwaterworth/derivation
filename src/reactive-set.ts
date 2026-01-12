import { ReactiveValue } from "./streaming.js";
import { ZSet } from "./z-set.js";
import { ZMap } from "./z-map.js";
import { ReactiveMap } from "./reactive-map.js";

export class ReactiveSet<T> {
  private readonly previousStep: ReactiveValue<ZSet<T>>;
  private readonly _materialized: ReactiveValue<ZSet<T>>;
  private readonly _changes: ReactiveValue<ZSet<T>>;

  constructor(changes: ReactiveValue<ZSet<T>>, snapshot?: ZSet<T>) {
    snapshot = snapshot ?? new ZSet<T>();
    this._changes = changes;
    this._materialized = changes.accumulate(snapshot, (acc, x) => {
      return acc.union(x);
    });
    this.previousStep = this.materialized.delay(snapshot);
  }

  get snapshot(): ZSet<T> {
    return this.materialized.value;
  }

  get previousSnapshot(): ZSet<T> {
    return this.previousStep.value;
  }

  get changes(): ReactiveValue<ZSet<T>> {
    return this._changes;
  }

  get materialized(): ReactiveValue<ZSet<T>> {
    return this._materialized;
  }

  get previousMaterialized(): ReactiveValue<ZSet<T>> {
    return this.previousStep;
  }

  groupBy<K>(func: (t: T) => K): ReactiveMap<K, T> {
    const snapshot: ZMap<K, T> = this.previousSnapshot.groupBy(func);
    const changes: ReactiveValue<ZMap<K, T>> = this._changes.map((x) =>
      x.groupBy(func),
    );
    return new ReactiveMap<K, T>(changes, snapshot);
  }

  join<TOther, TKey, TResult>(
    other: ReactiveSet<TOther>,
    thisKeySelector: (t: T) => TKey,
    otherKeySelector: (o: TOther) => TKey,
    resultSelector: (t: T, o: TOther) => TResult,
  ): ReactiveSet<TResult> {
    return this.groupBy(thisKeySelector)
      .join(other.groupBy(otherKeySelector))
      .mapValues((row) => resultSelector(row.get(0), row.get(1)))
      .flatten();
  }

  union(other: ReactiveSet<T>): ReactiveSet<T> {
    return new ReactiveSet(
      this._changes.zip(other._changes, (x, y) => x.union(y)),
      this.previousSnapshot.union(other.previousSnapshot),
    );
  }

  intersection(other: ReactiveSet<T>): ReactiveSet<T> {
    return new ReactiveSet(
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

  difference(other: ReactiveSet<T>): ReactiveSet<T> {
    return new ReactiveSet(
      this._changes.zip(other._changes, (x, y) => x.difference(y)),
      this.previousSnapshot.difference(other.previousSnapshot),
    );
  }

  filter(pred: (t: T) => boolean): ReactiveSet<T> {
    return new ReactiveSet(
      this._changes.map((x) => x.filter(pred)),
      this.previousSnapshot.filter(pred),
    );
  }
}
