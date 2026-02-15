import { describe, expect, it } from "vitest";
import { Constant } from "../constant.js";
import { External } from "../external.js";
import { Graph, ReactiveValue } from "../streaming.js";

describe("BindStream", () => {
  it("bind switches to the stream returned by the closure", () => {
    const g = new Graph();
    const low = ReactiveValue.fromNode(new Constant(10, g));
    const high = ReactiveValue.fromNode(new Constant(20, g));
    let useHigh = false;
    const selector = ReactiveValue.fromNode(new External(() => useHigh, g));

    const bound = selector.bind((flag) => (flag ? high.clone() : low.clone()));
    expect(bound.value).toBe(10);

    useHigh = true;
    g.step();
    expect(bound.value).toBe(20);
  });

  it("bind disposes replaced references and current reference on teardown", () => {
    const g = new Graph();
    const low = ReactiveValue.fromNode(new Constant(10, g));
    const high = ReactiveValue.fromNode(new Constant(20, g));
    let useHigh = false;
    const returned: ReactiveValue<number>[] = [];
    const selector = ReactiveValue.fromNode(new External(() => useHigh, g));

    const bound = selector.bind((flag) => {
      const ref = (flag ? high : low).clone();
      returned.push(ref);
      return ref;
    });
    expect(bound.value).toBe(10);
    expect(returned).toHaveLength(1);
    expect(returned[0]!.isReleased).toBe(true);

    useHigh = true;
    g.step();
    expect(bound.value).toBe(20);
    expect(returned).toHaveLength(2);
    expect(returned[0]!.isReleased).toBe(true);
    expect(returned[1]!.isReleased).toBe(true);
    expect(low.isReleased).toBe(false);
    expect(high.isReleased).toBe(false);

    bound.dispose();
    expect(returned[1]!.isReleased).toBe(true);
  });

  it("bind does not require wrapper recreation when only inner updates", () => {
    const g = new Graph();
    let inner = 10;
    const selector = ReactiveValue.fromNode(new Constant(true, g));
    const shared = ReactiveValue.fromNode(new External(() => inner, g));

    const bound = selector.bind(() => shared);
    expect(bound.value).toBe(10);
    expect(shared.isReleased).toBe(true);

    inner = 20;
    expect(() => g.step()).not.toThrow();
    expect(bound.value).toBe(20);

    bound.dispose();
    expect(shared.isReleased).toBe(true);
  });

  it("bind requires a fresh wrapper reference when outer value changes", () => {
    const g = new Graph();
    let selectorValue = false;
    const selector = ReactiveValue.fromNode(new External(() => selectorValue, g));
    let inner = 10;
    const shared = ReactiveValue.fromNode(new External(() => inner, g));

    const bound = selector.bind(() => shared);
    expect(bound.value).toBe(10);
    expect(shared.isReleased).toBe(true);

    selectorValue = true;
    inner = 20;
    expect(() => g.step()).toThrow(
      "received disposed ReactiveValue. (Is the callback returning the same ReactiveValue on each invocation?)",
    );

    bound.dispose();
    expect(shared.isReleased).toBe(true);
  });

  it("bind accepts fresh wrappers that resolve to the same internal value", () => {
    const g = new Graph();
    let selectorValue = 0;
    const selector = ReactiveValue.fromNode(new External(() => selectorValue, g));
    let inner = 10;
    const shared = ReactiveValue.fromNode(new External(() => inner, g));

    const bound = selector.bind(() => shared.clone());
    expect(bound.value).toBe(10);

    selectorValue = 1;
    inner = 20;
    expect(() => g.step()).not.toThrow();
    expect(bound.value).toBe(20);

    bound.dispose();
    expect(shared.isReleased).toBe(false);
  });

  it("bind does not compute stale inner streams after switching", () => {
    const g = new Graph();
    let useHigh = false;
    let lowValue = 1;
    let highValue = 10;
    let lowComputes = 0;
    let highComputes = 0;

    const selector = ReactiveValue.fromNode(new External(() => useHigh, g));
    const low = ReactiveValue.fromNode(new External(() => lowValue, g));
    const high = ReactiveValue.fromNode(new External(() => highValue, g));

    const bound = selector.bind((flag) =>
      (flag ? high : low).map((value) => {
        if (flag) {
          highComputes += 1;
        } else {
          lowComputes += 1;
        }
        return value;
      }),
    );

    expect(bound.value).toBe(1);
    expect(lowComputes).toBe(1);
    expect(highComputes).toBe(0);

    useHigh = true;
    g.step();
    expect(bound.value).toBe(10);
    expect(lowComputes).toBe(1);
    expect(highComputes).toBe(1);

    lowValue = 2;
    g.step();
    expect(bound.value).toBe(10);
    expect(lowComputes).toBe(1);
    expect(highComputes).toBe(1);

    highValue = 11;
    g.step();
    expect(bound.value).toBe(11);
    expect(lowComputes).toBe(1);
    expect(highComputes).toBe(2);
  });
});
