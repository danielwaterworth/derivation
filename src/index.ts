import { List } from "immutable";
import { Coordinator, ReactiveValue } from "./streaming.js";
import { Constant } from "./constant.js";
import { External } from "./external.js";
import { Input } from "./input.js";
import { CounterInput } from "./counter-input.js";
import { ReactiveMapSource } from "./reactive-map-source.js";
import { ReactiveSetSource } from "./reactive-set-source.js";
import { ReactiveLogSource } from "./reactive-log-source.js";
import { ZMap } from "./z-map.js";
import { ZSet } from "./z-set.js";

export { ReactiveValue } from "./streaming.js";
export { ZMap } from "./z-map.js";
export { ZSet } from "./z-set.js";
export { ReactiveMap } from "./reactive-map.js";
export { ReactiveSet } from "./reactive-set.js";
export { ReactiveMapSource } from "./reactive-map-source.js";
export { ReactiveSetSource } from "./reactive-set-source.js";
export { ReactiveLog } from "./reactive-log.js";
export { ReactiveLogSource } from "./reactive-log-source.js";
export { ZSetChangeInput } from "./z-set-change-input.js";
export { ZMapChangeInput } from "./z-map-change-input.js";
export { LogChangeInput } from "./log-change-input.js";
export { Input } from "./input.js";
export { Tuple } from "./tuple.js";

export class Graph {
  private readonly coordinator: Coordinator;

  constructor() {
    this.coordinator = new Coordinator();
  }

  step() {
    this.coordinator.step();
  }

  afterStep(callback: () => void): void {
    this.coordinator.afterStep(callback);
  }

  constantValue<T>(value: T): ReactiveValue<T> {
    return new Constant(value, this.coordinator);
  }

  inputValue<T>(initial: T): Input<T> {
    return new Input(initial, this.coordinator);
  }

  externalValue<T>(getter: () => T): ReactiveValue<T> {
    return new External(getter, this.coordinator);
  }

  counterValue(): ReactiveValue<number> {
    return new CounterInput(this.coordinator);
  }

  inputMap<K, V>(snapshot?: ZMap<K, V>): ReactiveMapSource<K, V> {
    return new ReactiveMapSource<K, V>(
      snapshot || new ZMap<K, V>(),
      this.coordinator,
    );
  }

  inputSet<T>(snapshot?: ZSet<T>): ReactiveSetSource<T> {
    return new ReactiveSetSource<T>(
      snapshot || new ZSet<T>(),
      this.coordinator,
    );
  }

  inputLog<T>(snapshot?: List<T>): ReactiveLogSource<T> {
    return new ReactiveLogSource<T>(
      snapshot || List<T>(),
      this.coordinator,
    );
  }
}
