import { ReactiveValue, Graph } from "./streaming.js";

export class External<T> extends ReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly func: () => T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = func();
    graph.addValue(this);
  }

  step(): void {
    this._value = this.func();
  }

  get value(): T {
    return this._value;
  }
}
