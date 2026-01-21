import { Graph, ReactiveValue } from "./streaming.js";
import { Constant } from "./constant.js";
import { External } from "./external.js";
import { Input } from "./input.js";
import { CounterInput } from "./counter-input.js";

export { ReactiveValue, Graph, FlattenStream } from "./streaming.js";
export { Input } from "./input.js";
export { Constant } from "./constant.js";
export { External } from "./external.js";
export { CounterInput } from "./counter-input.js";

export function constantValue<T>(graph: Graph, value: T): ReactiveValue<T> {
  return new Constant(value, graph);
}

export function inputValue<T>(graph: Graph, initial: T): Input<T> {
  return new Input(initial, graph);
}

export function externalValue<T>(
  graph: Graph,
  getter: () => T,
): ReactiveValue<T> {
  return new External(getter, graph);
}

export function counterValue(graph: Graph): ReactiveValue<number> {
  return new CounterInput(graph);
}
