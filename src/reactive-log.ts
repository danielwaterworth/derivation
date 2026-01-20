import { List } from "@rimbu/core";
import { ReactiveValue } from "./streaming.js";
import { ZSet } from "./z-set.js";
import { ReactiveSet } from "./reactive-set.js";

export class ReactiveLog<T> {
  private readonly _changes: ReactiveValue<List<T>>;
  private readonly _materialized: ReactiveValue<List<T>>;
  private readonly _previousStep: ReactiveValue<List<T>>;
  private readonly _length: ReactiveValue<number>;

  constructor(changes: ReactiveValue<List<T>>, snapshot?: List<T>) {
    snapshot = snapshot ?? List.empty();
    this._changes = changes;
    this._materialized = changes.accumulate(snapshot, (acc, x) => acc.concat(x));
    this._previousStep = this._materialized.delay(snapshot);
    this._length = changes.accumulate(snapshot.length, (acc, x) => acc + x.length);
  }

  get snapshot(): List<T> {
    return this._materialized.value;
  }

  get previousSnapshot(): List<T> {
    return this._previousStep.value;
  }

  get changes(): ReactiveValue<List<T>> {
    return this._changes;
  }

  get materialized(): ReactiveValue<List<T>> {
    return this._materialized;
  }

  get previousMaterialized(): ReactiveValue<List<T>> {
    return this._previousStep;
  }

  get length(): ReactiveValue<number> {
    return this._length;
  }

  fold<S>(initial: S, reducer: (acc: S, item: T) => S): ReactiveValue<S> {
    let snapshotState = initial;
    for (const item of this._previousStep.value) {
      snapshotState = reducer(snapshotState, item);
    }

    return this._changes.accumulate(snapshotState, (acc, items) => {
      let result = acc;
      for (const item of items) {
        result = reducer(result, item);
      }
      return result;
    });
  }

  map<U>(f: (t: T) => U): ReactiveLog<U> {
    const mappedChanges = this._changes.map((items) => items.map(f));
    const mappedSnapshot = this._previousStep.value.map(f);
    return new ReactiveLog<U>(mappedChanges, mappedSnapshot);
  }

  filter(pred: (t: T) => boolean): ReactiveLog<T> {
    const filteredChanges = this._changes.map((items) => items.filter(pred));
    const filteredSnapshot = this._previousStep.value.filter(pred);
    return new ReactiveLog<T>(filteredChanges, filteredSnapshot);
  }

  toSet<S>(this: ReactiveLog<ZSet<S>>): ReactiveSet<S> {
    const changes = this.changes.map((items) => {
      let result = new ZSet<S>();
      for (const item of items) {
        result = result.union(item);
      }
      return result;
    });

    let snapshot = new ZSet<S>();
    for (const item of this.previousSnapshot) {
      snapshot = snapshot.union(item);
    }

    return new ReactiveSet<S>(changes, snapshot);
  }
}
