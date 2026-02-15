import { describe, expect, it } from "vitest";
import { Constant } from "../constant.js";
import { DirtySet } from "../dirty-set.js";
import { External } from "../external.js";
import { Graph, InternalReactiveValue } from "../streaming.js";

class ManualStream extends InternalReactiveValue<number> {
  runs = 0;

  constructor(
    public readonly graph: Graph,
    private readonly onStep?: () => void,
  ) {
    super();
    graph.addValue(this);
  }

  step(): void {
    this.runs += 1;
    this.onStep?.();
  }

  get value(): number {
    return this.runs;
  }
}

describe("Graph internals", () => {
  it("runs afterStep callbacks after stream processing", () => {
    const g = new Graph();
    const events: string[] = [];
    const stream = new ManualStream(g, () => events.push("step"));

    g.afterStep(() => events.push("after"));
    g.markDirtyNextStep(stream);
    g.step();

    expect(events).toEqual(["step", "after"]);
  });

  it("runs afterStep callbacks in registration order on every step", () => {
    const g = new Graph();
    const seen: number[] = [];

    g.afterStep(() => seen.push(1));
    g.afterStep(() => seen.push(2));

    g.step();
    g.step();

    expect(seen).toEqual([1, 2, 1, 2]);
  });

  it("markDirtyNextStep schedules work for the next step only", () => {
    const g = new Graph();
    const stream = new ManualStream(g);

    g.markDirtyNextStep(stream);
    expect(stream.runs).toBe(0);

    g.step();
    expect(stream.runs).toBe(1);

    g.step();
    expect(stream.runs).toBe(1);
  });

  it("ignores markDirty calls for disposed streams", () => {
    const g = new Graph();
    const stream = new ManualStream(g);
    stream.dispose();

    g.markDirty(stream);
    g.markDirtyNextStep(stream);
    g.step();

    expect(stream.runs).toBe(0);
  });

  it("throws when a step marks a lower-height stream dirty", () => {
    const g = new Graph();
    const low = new ManualStream(g);
    const high = new ManualStream(g, () => g.markDirty(low));
    high.height = 1;

    g.markDirtyNextStep(high);

    expect(() => g.step()).toThrow(
      "Cannot mark dirty value with height 0 before last processed height 1",
    );
  });

  it("can stop and resume external re-sampling", () => {
    const g = new Graph();
    let n = 0;
    const ext = new External(() => ++n, g);

    expect(ext.value).toBe(1);
    g.step();
    expect(ext.value).toBe(2);

    g.removeExternal(ext);
    g.step();
    expect(ext.value).toBe(2);

    g.addExternal(ext);
    g.step();
    expect(ext.value).toBe(3);
  });
});

describe("DirtySet", () => {
  it("deduplicates entries and pops by height", () => {
    const g = new Graph();
    const low = new Constant("low", g);
    const mid = new Constant("mid", g);
    const high = new Constant("high", g);

    low.height = 1;
    mid.height = 2;
    high.height = 3;

    const set = new DirtySet();
    set.add(mid);
    set.add(high);
    set.add(low);
    set.add(mid);

    expect(set.size).toBe(3);
    expect(set.pop()).toBe(low);
    expect(set.pop()).toBe(mid);
    expect(set.pop()).toBe(high);
    expect(set.pop()).toBeUndefined();
  });

  it("rebuilds heap ordering after height changes", () => {
    const g = new Graph();
    const a = new Constant("a", g);
    const b = new Constant("b", g);

    a.height = 1;
    b.height = 2;

    const set = new DirtySet();
    set.add(a);
    set.add(b);

    a.height = 3;
    b.height = 0;
    set.rebuild();

    expect(set.pop()).toBe(b);
    expect(set.pop()).toBe(a);
  });

  it("tracks membership and emptiness", () => {
    const g = new Graph();
    const value = new Constant(1, g);
    const set = new DirtySet();

    expect(set.isEmpty()).toBe(true);
    set.add(value);

    expect(set.has(value)).toBe(true);
    expect(set.isEmpty()).toBe(false);

    set.delete(value);
    expect(set.has(value)).toBe(false);
    expect(set.size).toBe(0);
    expect(set.isEmpty()).toBe(true);
  });
});
