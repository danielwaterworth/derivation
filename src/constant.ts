import { ReactiveValue, Graph } from "./streaming.js";

export class Constant<T> extends ReactiveValue<T> {
  constructor(
    public readonly value: T,
    public readonly graph: Graph,
  ) {
    super();
    graph.addValue(this);
  }

  step(): void {}
}
