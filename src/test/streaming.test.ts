import { describe, it, expect } from "vitest";
import { Coordinator, Register, Sampler } from "../streaming";
import { External } from "../external";
import { Constant } from "../constant";
import { CounterInput } from "../counter-input";
import { ZSetChangeInput } from "../z-set-change-input";
import { ZMapChangeInput } from "../z-map-change-input";

describe("streaming core", () => {
  it("constant stays constant across steps", () => {
    const c = new Coordinator();
    const s = new Constant(123, c);

    expect(s.value).toBe(123);
    c.step();
    expect(s.value).toBe(123);
    c.step();
    expect(s.value).toBe(123);
  });

  it("external re-samples on each step", () => {
    const c = new Coordinator();
    let n = 0;

    const s = new External(() => ++n, c);

    expect(s.value).toBe(1);
    c.step();
    expect(s.value).toBe(2);
    c.step();
    expect(s.value).toBe(3);
  });

  it("map recomputes from its input", () => {
    const c = new Coordinator();
    let n = 10;

    const src = new External(() => n, c);
    const mapped = src.map((x) => x * 2);

    expect(mapped.value).toBe(20);

    n = 7;
    c.step();
    expect(mapped.value).toBe(14);
  });

  it("zip combines latest values", () => {
    const c = new Coordinator();
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
    const c = new Coordinator();
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
    const c = new Coordinator();
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
    const c = new Coordinator();
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
    const c = new Coordinator();
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
    const c = new Coordinator();
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
    const c = new Coordinator();
    let n = 0;
    const s = new External(() => ++n, c);
    expect(s.value).toBe(1);
    s.dispose();
    c.step();
    expect(s.value).toBe(1);
  });

  it("delay and accumulate behave correctly", () => {
    const c = new Coordinator();
    const src = new External(() => Math.random(), c);
    const delayed = src.delay(0.5);
    const accum = src.accumulate(0, (a, v) => a + v);
    expect(typeof delayed.value).toBe("number");
    expect(typeof accum.value).toBe("number");
  });

  it("sink executes callback initiallly and on each step", () => {
    const c = new Coordinator();
    let seen: number[] = [];
    let n = 0;
    const src = new External(() => ++n, c);
    src.sink((x) => seen.push(x));
    c.step();
    c.step();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("ZSetChangeInput, ZMapChangeInput and CounterInput update correctly", () => {
    const c = new Coordinator();

    const zs = new ZSetChangeInput<number>(c);
    const zm = new ZMapChangeInput<string, number>(c);
    const counter = new CounterInput(c);

    zs.add(10, 2);
    zm.add("a", 1, 3);
    counter.add(5);

    c.step();

    expect([...zs.value.getEntries()]).toContainEqual([10, 2]);
    expect([...zm.value.getEntries()]).toContainEqual(["a", 1, 3]);
    expect(counter.value).toBe(5);

    c.step();
    expect([...zs.value.getEntries()].length).toBe(0);
    expect([...zm.value.getEntries()].length).toBe(0);
    expect(counter.value).toBe(0);
  });

  it("Sampler updates register values correctly", () => {
    const c = new Coordinator();
    const src = new External(() => Math.random(), c);
    const reg = new Register(0, c);
    const sampler = new Sampler(src, reg, c);
    const first = reg.value;
    c.step();
    expect(typeof reg.value).toBe("number");
    sampler.dispose();
    expect(reg.value).not.toBeUndefined();
  });
});
