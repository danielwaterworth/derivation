import { ReactiveValue, Graph } from "./streaming.js";

export class CounterInput extends ReactiveValue<number> {
  private current = 0;
  private pending = 0;

  constructor(public readonly graph: Graph) {
    super();
    graph.addValue(this);
  }

  add(weight: number): void {
    this.pending += weight;
    this.graph.markDirtyNextStep(this);
  }

  step(): void {
    const oldValue = this.current;
    this.current = this.pending;
    this.pending = 0;
    if (oldValue !== this.current) {
      this.invalidateDependents();
    }
    this.graph.markDirtyNextStep(this);
  }

  get value(): number {
    return this.current;
  }
}
