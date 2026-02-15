import { InternalReactiveValue, Graph } from "./streaming.js";

export class External<T> extends InternalReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly func: () => T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = func();
    graph.addValue(this);
    graph.addExternal(this);
  }

  dispose(): void {
    super.dispose();
  }

  step(): void {
    const oldValue = this._value;
    this._value = this.func();
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    this.assertNotDisposed();
    return this._value;
  }
}
