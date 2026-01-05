import { ReactiveValue, Coordinator } from "./streaming";

export class Constant<T> extends ReactiveValue<T> {
  constructor(
    public readonly value: T,
    public readonly coordinator: Coordinator,
  ) {
    super();
    coordinator.addReactive(this);
  }

  step(): void {}
}
