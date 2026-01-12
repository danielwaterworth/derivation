import { ReactiveValue, Coordinator } from "./streaming.js";

export class External<T> extends ReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly func: () => T,
    public readonly coordinator: Coordinator,
  ) {
    super();
    this._value = func();
    coordinator.addReactive(this);
  }

  step(): void {
    this._value = this.func();
  }

  get value(): T {
    return this._value;
  }
}
