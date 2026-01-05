import { Coordinator, ReactiveValue } from "./streaming";
import { Constant } from "./constant";
import { External } from "./external";
import { Input } from "./input";
import { CounterInput } from "./counter-input";
import { ReactiveMapSource } from "./reactive-map-source";
import { ReactiveSetSource } from "./reactive-set-source";
import { ZMap } from "./z-map";
import { ZSet } from "./z-set";

export { ReactiveValue } from "./streaming";
export { ZMap } from "./z-map";
export { ZSet } from "./z-set";
export { ReactiveMap } from "./reactive-map";
export { ReactiveSet } from "./reactive-set";
export { ReactiveMapSource } from "./reactive-map-source";
export { ReactiveSetSource } from "./reactive-set-source";
export { Input } from "./input";

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
}
