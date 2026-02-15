import { InternalReactiveValue, Graph } from "./streaming.js";

export class Constant<T> extends InternalReactiveValue<T> {
  private readonly _value: T;

  constructor(
    value: T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = value;
    graph.addValue(this);
  }

  step(): void {}

  get value(): T {
    this.assertNotDisposed();
    return this._value;
  }
}
