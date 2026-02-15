import { describe, it, expect } from "vitest";
import {
  Graph,
  InternalReactiveValue,
  Register,
  ReactiveValue,
  Sampler,
} from "../streaming.js";
import { External } from "../external.js";
import { Constant } from "../constant.js";
import { InternalCounterInput } from "../counter-input.js";
import { externalValue } from "../index.js";

class HarnessNode extends InternalReactiveValue<number> {
  private _value: number;

  constructor(
    value: number,
    public readonly graph: Graph,
  ) {
    super();
    this._value = value;
    graph.addValue(this);
  }

  step(): void {}

  get value(): number {
    this.assertNotDisposed();
    return this._value;
  }

  attach(input: InternalReactiveValue<unknown>): void {
    this.trackInput(input);
  }

  detach(input: InternalReactiveValue<unknown>): void {
    this.untrackInput(input);
  }
}

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

  it("constant step is a no-op", () => {
    const c = new Graph();
    const s = new Constant(123, c);
    s.step();
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

  it("register does not invalidate dependents when stepped without a value change", () => {
    const c = new Graph();
    const reg = new Register(1, c);
    let computes = 0;
    const derived = reg.map((x) => {
      computes += 1;
      return x + 1;
    });

    expect(computes).toBe(1);
    c.markDirtyNextStep(reg);
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
    reg.dispose();
  });

  it("register setNextValue is a no-op when assigning the same value", () => {
    const c = new Graph();
    const reg = new Register(5, c);
    let computes = 0;
    const derived = reg.map((x) => {
      computes += 1;
      return x;
    });

    expect(computes).toBe(1);
    reg.setNextValue(5);
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
    reg.dispose();
  });

  it("dispose on accumulated observer tears down feedback sampler", () => {
    const c = new Graph();
    let n = 1;
    let reducerRuns = 0;

    const src = new External(() => n, c);
    const sum = ReactiveValue.fromNode(
      src.accumulate(0, (acc, value) => {
        reducerRuns += 1;
        return acc + value;
      }),
    );

    expect(reducerRuns).toBe(1);
    sum.dispose();

    n = 5;
    c.step();
    n = 9;
    c.step();

    expect(reducerRuns).toBe(1);
  });

  it("map does not invalidate dependents when mapped value is unchanged", () => {
    const c = new Graph();
    let n = 0;
    const src = new External(() => n, c);
    const mapped = src.map(() => 1);
    let computes = 0;
    const derived = mapped.map((x) => {
      computes += 1;
      return x + 1;
    });

    expect(computes).toBe(1);
    n = 10;
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
    mapped.dispose();
  });

  it("zip does not invalidate dependents when combined value is unchanged", () => {
    const c = new Graph();
    let a = 1;
    let b = 2;
    const sa = new External(() => a, c);
    const sb = new External(() => b, c);
    const zipped = sa.zip(sb, (x, y) => x + y);
    let computes = 0;
    const derived = zipped.map((x) => {
      computes += 1;
      return x;
    });

    expect(computes).toBe(1);
    a = 2;
    b = 1;
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
    zipped.dispose();
  });

  it("bind switch does not invalidate dependents when value stays equal", () => {
    const c = new Graph();
    let useHigh = false;
    const selector = new External(() => useHigh, c);
    const low = new Constant(10, c);
    const high = new Constant(10, c);
    const bound = selector.bind((flag) =>
      ReactiveValue.fromNode(flag ? high : low),
    );
    let computes = 0;
    const derived = bound.map((x) => {
      computes += 1;
      return x;
    });

    expect(computes).toBe(1);
    useHigh = true;
    c.step();
    expect(computes).toBe(1);
    expect(bound.value).toBe(10);

    derived.dispose();
    bound.dispose();
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
    expect(() => src.value).toThrow("Cannot access a disposed reactive value");
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
    expect(() => s.value).toThrow("Cannot access a disposed reactive value");
  });

  it("disposed external does not step from stale dirty queue entries", () => {
    const c = new Graph();
    let runs = 0;
    const s = new External(() => ++runs, c);

    expect(runs).toBe(1);
    c.markDirtyNextStep(s);
    s.dispose();
    c.step();

    expect(runs).toBe(1);
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
    const counter = new InternalCounterInput(c);

    counter.add(5);
    expect(counter.value).toBe(0);

    c.step();
    expect(counter.value).toBe(5);

    c.step();
    expect(counter.value).toBe(0);
  });

  it("CounterInput add(0) does not invalidate dependents", () => {
    const c = new Graph();
    const counter = new InternalCounterInput(c);
    let computes = 0;
    const derived = counter.map((x) => {
      computes += 1;
      return x + 1;
    });

    expect(computes).toBe(1);
    counter.add(0);
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
  });

  it("CounterInput does not invalidate dependents when value is unchanged", () => {
    const c = new Graph();
    const counter = new InternalCounterInput(c);
    let computes = 0;
    const derived = counter.map((x) => {
      computes += 1;
      return x + 1;
    });

    expect(computes).toBe(1);
    c.step();
    expect(computes).toBe(1);

    derived.dispose();
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

  it("Sampler value is undefined while active and throws after dispose", () => {
    const c = new Graph();
    const src = new External(() => 1, c);
    const reg = new Register(0, c);
    const sampler = new Sampler(src, reg, c);

    expect(sampler.value).toBeUndefined();
    sampler.dispose();
    expect(() => sampler.value).toThrow("Cannot access a disposed reactive value");
  });

  it("SinkStream value is undefined while active and throws after dispose", () => {
    const c = new Graph();
    const src = new External(() => 1, c);
    const sink = src.sink(() => undefined);

    expect(sink.value).toBeUndefined();
    sink.dispose();
    expect(() => sink.value).toThrow("Cannot access a disposed reactive value");
  });

  it("disposing an internal node twice is a no-op", () => {
    const c = new Graph();
    const s = new External(() => 1, c);

    expect(() => s.dispose()).not.toThrow();
    expect(() => s.dispose()).not.toThrow();
  });

  it("wrapper dispose is idempotent even when node is already disposed", () => {
    const c = new Graph();
    const node = new External(() => 1, c);
    node.dispose();

    const ref = ReactiveValue.fromNode(node);
    expect(() => ref.value).toThrow("Cannot access a disposed reactive value");
    expect(() => ref.dispose()).not.toThrow();
    expect(() => ref.dispose()).not.toThrow();
    expect(ref.isReleased).toBe(true);
  });

  it("internal helper methods no-op on disposed/missing references", () => {
    const c = new Graph();
    const src = new HarnessNode(1, c);
    const dep = new HarnessNode(2, c);

    dep.attach(src);
    dep.detach(src);
    dep.detach(src);

    src.dispose();
    expect(() => src.addDependent(dep)).not.toThrow();
    expect(() => src.ensureHeight(10)).not.toThrow();
    expect(src.height).toBe(0);

    dep.dispose();
  });

  it("public externalValue constructor returns a reactive wrapper", () => {
    const c = new Graph();
    let n = 0;
    const src = externalValue(c, () => ++n);

    expect(src.value).toBe(1);
    c.step();
    expect(src.value).toBe(2);
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
});
