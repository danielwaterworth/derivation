import { describe, it, expect } from "vitest";
import { Graph, type ReactiveValue } from "../streaming.js";
import { Input } from "../input.js";
import { Constant } from "../constant.js";

describe("building nodes in accumulate", () => {
  it("allows accumulate nodes build nodes that refer to nodes in the past", () => {
    const g = new Graph();
    const initial: ReactiveValue<number> = new Constant(0, g);
    const source1 = new Input(1, g);

    const sum = new Constant(null, g).accumulate(initial, (acc) => {
      return acc.zip(source1, (a, b) => a + b);
    });

    g.step();
    source1.push(2);
    g.step();
  });
});
