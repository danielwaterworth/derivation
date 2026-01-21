import { describe, it, expect } from "vitest";
import { Graph, Register, Sampler } from "../streaming.js";
import { External } from "../external.js";
import { Constant } from "../constant.js";
import { CounterInput } from "../counter-input.js";

describe("streaming core", () => {
  it("constant stays constant across steps", () => {
    const c = new Graph();
    const s = new Constant(123, c);

    expect(s.value).toBe(123);
    c.step();
    expect(s.value).toBe(123);
    c.step();
    expect(s.value).toBe(123);
  });

  it("external re-samples on each step", () => {
    const c = new Graph();
    let n = 0;

    const s = new External(() => ++n, c);

    expect(s.value).toBe(1);
    c.step();
    expect(s.value).toBe(2);
    c.step();
    expect(s.value).toBe(3);
  });

  it("map recomputes from its input", () => {
    const c = new Graph();
    let n = 10;

    const src = new External(() => n, c);
    const mapped = src.map((x) => x * 2);

    expect(mapped.value).toBe(20);

    n = 7;
    c.step();
    expect(mapped.value).toBe(14);
  });

  it("zip combines latest values", () => {
    const c = new Graph();
    let a = 1;
    let b = 10;

    const sa = new External(() => a, c);
    const sb = new External(() => b, c);
    const z = sa.zip(sb, (x, y) => x + y);

    expect(z.value).toBe(11);

    a = 5;
    c.step();
    expect(z.value).toBe(15);

    b = 2;
    c.step();
    expect(z.value).toBe(7);
  });

  it("delay provides a 1-step lag (register semantics)", () => {
    const c = new Graph();
    let n = 0;

    const src = new External(() => ++n, c);
    const delayed = src.delay(0);

    expect(src.value).toBe(1);
    expect(delayed.value).toBe(0);

    c.step();
    expect(src.value).toBe(2);
    expect(delayed.value).toBe(1);

    c.step();
    expect(src.value).toBe(3);
    expect(delayed.value).toBe(2);
  });

  it("accumulate folds with a register feedback loop", () => {
    const c = new Graph();
    let x = 1;

    const input = new External(() => x, c);
    const sum = input.accumulate(0, (acc, a) => acc + a);
    expect(sum.value).toBe(1);

    c.step();
    expect(sum.value).toBe(2);

    x = 3;
    c.step();
    expect(sum.value).toBe(5);

    x = -2;
    c.step();
    expect(sum.value).toBe(3);
  });

  it("sink runs a callback initially and each step", () => {
    const c = new Graph();
    let n = 0;

    const src = new External(() => ++n, c);
    const seen: number[] = [];
    src.sink((v) => seen.push(v));

    expect(seen).toEqual([1]);

    c.step();
    expect(seen).toEqual([1, 2]);

    c.step();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("dispose removes a stream from stepping", () => {
    const c = new Graph();
    let n = 0;

    const src = new External(() => ++n, c);

    expect(src.value).toBe(1);
    c.step();
    expect(src.value).toBe(2);

    src.dispose();
    c.step();
    expect(src.value).toBe(2);
  });

  it("zip2/zip3/zip4/zip5 combine multiple streams", () => {
    const c = new Graph();
    const a = new Constant(1, c);
    const b = new Constant(2, c);
    const d = new Constant(3, c);
    const e = new Constant(4, c);
    const f = new Constant(5, c);

    const z2 = a.zip2(b, d, (x, y, z) => x + y + z);
    const z3 = a.zip3(b, d, e, (x, y, z, w) => x + y + z + w);
    const z4 = a.zip4(b, d, e, f, (x, y, z, w, v) => x + y + z + w + v);

    expect(z2.value).toBe(6);
    expect(z3.value).toBe(10);
    expect(z4.value).toBe(15);
  });

  it("Coordinator.remove stops stepping", () => {
    const c = new Graph();
    let n = 0;
    const s = new External(() => ++n, c);
    expect(s.value).toBe(1);
    s.dispose();
    c.step();
    expect(s.value).toBe(1);
  });

  it("delay and accumulate behave correctly", () => {
    const c = new Graph();
    const src = new External(() => Math.random(), c);
    const delayed = src.delay(0.5);
    const accum = src.accumulate(0, (a, v) => a + v);
    expect(typeof delayed.value).toBe("number");
    expect(typeof accum.value).toBe("number");
  });

  it("sink executes callback initiallly and on each step", () => {
    const c = new Graph();
    let seen: number[] = [];
    let n = 0;
    const src = new External(() => ++n, c);
    src.sink((x) => seen.push(x));
    c.step();
    c.step();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("CounterInput updates correctly", () => {
    const c = new Graph();
    const counter = new CounterInput(c);

    counter.add(5);
    expect(counter.value).toBe(0);

    c.step();
    expect(counter.value).toBe(5);

    c.step();
    expect(counter.value).toBe(0);
  });

  it("Sampler updates register values correctly", () => {
    const c = new Graph();
    const src = new External(() => Math.random(), c);
    const reg = new Register(0, c);
    const sampler = new Sampler(src, reg, c);
    const first = reg.value;
    c.step();
    expect(typeof reg.value).toBe("number");
    sampler.dispose();
    expect(reg.value).not.toBeUndefined();
  });

  it("nodes added during construction run immediately", () => {
    const c = new Graph();
    const order: string[] = [];
    const nodes: External<number>[] = [];

    // Parent creates child during construction
    let child: External<number> | null = null;
    const parent = new External(() => {
      order.push("parent");
      if (!child) {
        child = new External(() => {
          order.push("child");
          return 2;
        }, c);
        nodes.push(child);
      }
      return 1;
    }, c);
    nodes.push(parent);

    // During construction: parent's func runs first, then child's func runs
    expect(order).toEqual(["parent", "child"]);

    order.length = 0;
    c.step();
    // During step: child runs before parent (dependency order)
    expect(order).toEqual(["child", "parent"]);
  });

  it("node created during step can read values from earlier nodes", () => {
    const c = new Graph();
    const nodes: External<number>[] = [];
    let n = 10;
    const src = new External(() => n, c);
    nodes.push(src);

    let childValue: number | undefined;
    let child: External<number> | null = null;

    const parent = new External(() => {
      if (!child) {
        child = new External(() => {
          childValue = src.value * 2;
          return childValue!;
        }, c);
        nodes.push(child);
      }
      return src.value;
    }, c);
    nodes.push(parent);

    // Child ran during construction, read src.value = 10
    expect(childValue).toBe(20);

    n = 5;
    c.step();
    expect(childValue).toBe(10);
  });

  it("flatten unwraps nested ReactiveValue", () => {
    const c = new Graph();

    const inner1 = new Constant(10, c);
    const inner2 = new Constant(20, c);

    let currentInner = inner1;
    const outer = new External(() => currentInner, c);

    const flattened = outer.flatten();

    expect(flattened.value).toBe(10);

    currentInner = inner2;
    c.step();
    expect(flattened.value).toBe(20);
  });

  it("flatten tracks changes in both outer and inner", () => {
    const c = new Graph();

    let innerValue = 5;
    const inner = new External(() => innerValue, c);

    const outer = new Constant(inner, c);
    const flattened = outer.flatten();

    expect(flattened.value).toBe(5);

    innerValue = 15;
    c.step();
    expect(flattened.value).toBe(15);
  });
});
