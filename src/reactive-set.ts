import { ReactiveValue } from "./streaming.js";
import { ZSet } from "./z-set";
import { ZMap } from "./z-map";
import { ReactiveMap } from "./reactive-map";

export class ReactiveSet<T> {
  private readonly materialized: ReactiveValue<ZSet<T>>;
  private readonly previousStep: ReactiveValue<ZSet<T>>;
  private readonly _changes: ReactiveValue<ZSet<T>>;

  constructor(changes: ReactiveValue<ZSet<T>>, snapshot?: ZSet<T>) {
    snapshot = snapshot ?? new ZSet<T>();
    this._changes = changes;
    this.materialized = changes.accumulate(snapshot, (acc, x) => {
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
      .mapValues(([a, b]) => resultSelector(a, b))
      .flatten();
  }
}
