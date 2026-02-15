import { Graph, ReactiveValue, Input, Counter } from "./streaming.js";
import { Constant } from "./constant.js";
import { External } from "./external.js";
import { InternalInput } from "./input.js";
import { InternalCounterInput } from "./counter-input.js";

export {
  Graph,
  BindStream,
  ReactiveValue,
  Input,
  Counter,
} from "./streaming.js";

export function constantValue<T>(graph: Graph, value: T): ReactiveValue<T> {
  return ReactiveValue.fromNode(new Constant(value, graph));
}

export function inputValue<T>(graph: Graph, initial: T): Input<T> {
  return new Input(new InternalInput(initial, graph));
}

export function externalValue<T>(
  graph: Graph,
  getter: () => T,
): ReactiveValue<T> {
  return ReactiveValue.fromNode(new External(getter, graph));
}

export function counterValue(graph: Graph): Counter {
  return new Counter(new InternalCounterInput(graph));
}
