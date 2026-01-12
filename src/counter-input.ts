import { ReactiveValue, Coordinator } from "./streaming.js";

export class CounterInput extends ReactiveValue<number> {
  private current = 0;
  private pending = 0;

  constructor(public readonly coordinator: Coordinator) {
    super();
    coordinator.addReactive(this);
  }

  add(weight: number): void {
    this.pending += weight;
  }

  step(): void {
    this.current = this.pending;
    this.pending = 0;
  }

  get value(): number {
    return this.current;
  }
}
