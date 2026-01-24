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
    graph.addExternal(this);
  }

  dispose(): void {
    this.graph.removeExternal(this);
    this.graph.removeValue(this);
  }

  step(): void {
    const oldValue = this._value;
    this._value = this.func();
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    return this._value;
  }
}
