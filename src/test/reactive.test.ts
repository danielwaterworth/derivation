import { describe, it, expect } from "vitest";
import { Coordinator } from "../streaming";
import { ZSetChangeInput } from "../z-set-change-input";
import { ZMapChangeInput } from "../z-map-change-input";
import { ReactiveSet } from "../reactive-set";
import { ReactiveMap } from "../reactive-map";
import { ZMap } from "../z-map";
import { Tuple } from "../tuple";

describe("ReactiveSet", () => {
  it("accumulates and materializes over steps", () => {
    const c = new Coordinator();
    const input = new ZSetChangeInput<string>(c);
    const rset = new ReactiveSet(input);

    expect(rset.snapshot.isEmpty()).toBe(true);

    input.add("apple");
    c.step();
    expect(rset.snapshot.get("apple")).toBe(1);
    input.add("apple");
    expect(rset.snapshot.get("apple")).toBe(1);
    c.step();
    expect(rset.snapshot.get("apple")).toBe(2);
  });

  it("performs groupby", () => {
    const c = new Coordinator();
    const input = new ZSetChangeInput<string>(c);
    const rset = new ReactiveSet(input);

    input.add("apple");
    c.step();
    const grouped = rset.groupBy((key) => key[0]);
    expect(grouped.snapshot.get("a").get("apple")).toBe(1);
  });

  it("ReactiveSet groupBy creates ReactiveMap and joins correctly", () => {
    const c = new Coordinator();

    const inputA = new ZSetChangeInput<number>(c);
    const inputB = new ZSetChangeInput<number>(c);

    inputA.add(1);
    inputA.add(2);
    inputB.add(2);
    inputB.add(3);

    c.step();

    const rsA = new ReactiveSet(inputA);
    const rsB = new ReactiveSet(inputB);

    const joined = rsA.join(
      rsB,
      (x) => x,
      (y) => y,
      (a, b) => a + b,
    );

    const snapshot = joined.snapshot;
    const entries = [...snapshot.getEntries()].map(([v, w]) => [v, w]);
    expect(entries).toContainEqual([4, 1]);
    expect(entries).not.toContainEqual([2, expect.anything()]);
  });

  it("ReactiveMap mapValues and flatten work", () => {
    const c = new Coordinator();
    const input = new ZMapChangeInput<string, number>(c);

    input.add("a", 1);
    input.add("b", 2);

    const rm = new ReactiveMap(input);

    c.step();

    const doubled = rm.mapValues((v) => v * 2);
    const flat = doubled.flatten();

    const entries = [...flat.snapshot.getEntries()];
    expect(entries).toContainEqual([2, 1]);
    expect(entries).toContainEqual([4, 1]);
  });

  it("ReactiveMap setup", () => {
    const c = new Coordinator();
    const change = new ZMapChangeInput<string, number>(c);
    const reactive = new ReactiveMap(change);

    change.add("foo", 1);

    expect([...reactive.previousMaterialized.value.getEntries()].length).toBe(
      0,
    );
    expect([...reactive.materialized.value.getEntries()].length).toBe(0);
    expect([...reactive.changes.value.getEntries()].length).toBe(0);

    c.step();

    expect([...reactive.previousMaterialized.value.getEntries()].length).toBe(
      0,
    );
    expect([...reactive.materialized.value.getEntries()].length).toBe(1);
    expect([...reactive.changes.value.getEntries()].length).toBe(1);
  });

  it("ReactiveMap join combines maps by key", () => {
    const c = new Coordinator();

    const left = new ZMapChangeInput<string, number>(c);
    const right = new ZMapChangeInput<string, string>(c);

    left.add("x", 10);
    right.add("x", "A");
    right.add("y", "B");

    const rmLeft = new ReactiveMap(left);
    const rmRight = new ReactiveMap(right);

    const joined = rmLeft.join(rmRight);

    c.step();

    let entries = [...joined.snapshot.getEntries()];
    expect(entries).toContainEqual(["x", Tuple(10, "A"), 1]);
    expect(entries.some(([k]) => k === "y")).toBe(false);

    left.add("y", 20);

    c.step();

    entries = [...joined.snapshot.getEntries()];
    expect(entries).toContainEqual(["x", Tuple(10, "A"), 1]);
    expect(entries).toContainEqual(["y", Tuple(20, "B"), 1]);
  });

  it("ReactiveMap initializes correctly with snapshot", () => {
    const c = new Coordinator();
    const initial = new ZMap<string, number>().add("a", 1);
    const input = new ZMapChangeInput<string, number>(c);

    const rm = new ReactiveMap(input, initial);
    expect([...rm.snapshot.getEntries()].length).toBe(1);
  });
});
