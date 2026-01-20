import { describe, it, expect } from "vitest";
import { Coordinator } from "../streaming.js";
import { ZSetChangeInput } from "../z-set-change-input.js";
import { ZMapChangeInput } from "../z-map-change-input.js";
import { ReactiveSet } from "../reactive-set.js";
import { ReactiveMap } from "../reactive-map.js";
import { ZMap } from "../z-map.js";
import { Tuple } from "../tuple.js";

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
    expect(entries.length).toBe(1);
    expect(entries[0]![0]).toBe("x");
    expect(entries[0]![1].get(0)).toBe(10);
    expect(entries[0]![1].get(1)).toBe("A");
    expect(entries[0]![2]).toBe(1);
    expect(entries.some(([k]) => k === "y")).toBe(false);

    left.add("y", 20);

    c.step();

    entries = [...joined.snapshot.getEntries()];
    expect(entries.length).toBe(2);
    const xEntry = entries.find(([k]) => k === "x");
    const yEntry = entries.find(([k]) => k === "y");
    expect(xEntry).toBeDefined();
    expect(yEntry).toBeDefined();
    expect(xEntry![1].get(0)).toBe(10);
    expect(xEntry![1].get(1)).toBe("A");
    expect(xEntry![2]).toBe(1);
    expect(yEntry![1].get(0)).toBe(20);
    expect(yEntry![1].get(1)).toBe("B");
    expect(yEntry![2]).toBe(1);
  });

  it("ReactiveMap initializes correctly with snapshot", () => {
    const c = new Coordinator();
    const initial = new ZMap<string, number>().add("a", 1);
    const input = new ZMapChangeInput<string, number>(c);

    const rm = new ReactiveMap(input, initial);
    expect([...rm.snapshot.getEntries()].length).toBe(1);
  });

  it("ReactiveSet union combines two sets", () => {
    const c = new Coordinator();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    const rs1 = new ReactiveSet(input1);
    const rs2 = new ReactiveSet(input2);
    const union = rs1.union(rs2);

    input1.add("a", 2);
    input2.add("a", 3);
    input2.add("b", 1);
    c.step();

    expect(union.snapshot.get("a")).toBe(5);
    expect(union.snapshot.get("b")).toBe(1);
  });

  it("ReactiveSet intersection incremental updates", () => {
    const c = new Coordinator();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    input1.add("x", 2);
    input1.add("y", 3);
    input2.add("x", 4);
    input2.add("z", 5);
    c.step();

    const rs1 = new ReactiveSet(input1);
    const rs2 = new ReactiveSet(input2);
    const intersection = rs1.intersection(rs2);

    expect(intersection.snapshot.get("x")).toBe(8);
    expect(intersection.snapshot.get("y")).toBe(0);
    expect(intersection.snapshot.get("z")).toBe(0);

    input1.add("z", 2);
    c.step();

    expect(intersection.snapshot.get("x")).toBe(8);
    expect(intersection.snapshot.get("z")).toBe(10);
  });

  it("ReactiveSet difference incremental updates", () => {
    const c = new Coordinator();
    const input1 = new ZSetChangeInput<string>(c);
    const input2 = new ZSetChangeInput<string>(c);

    input1.add("x", 5);
    input1.add("y", 2);
    input2.add("x", 3);
    c.step();

    const rs1 = new ReactiveSet(input1);
    const rs2 = new ReactiveSet(input2);
    const diff = rs1.difference(rs2);

    expect(diff.snapshot.get("x")).toBe(2);
    expect(diff.snapshot.get("y")).toBe(2);

    input2.add("y", 1);
    c.step();

    expect(diff.snapshot.get("x")).toBe(2);
    expect(diff.snapshot.get("y")).toBe(1);
  });

  it("ReactiveSet filter incremental updates", () => {
    const c = new Coordinator();
    const input = new ZSetChangeInput<number>(c);

    input.add(5, 1);
    input.add(15, 2);
    input.add(25, 1);
    c.step();

    const rs = new ReactiveSet(input);
    const filtered = rs.filter((x) => x > 10);

    expect(filtered.snapshot.get(5)).toBe(0);
    expect(filtered.snapshot.get(15)).toBe(2);
    expect(filtered.snapshot.get(25)).toBe(1);

    input.add(5, 3);
    input.add(20, 1);
    c.step();

    expect(filtered.snapshot.get(5)).toBe(0);
    expect(filtered.snapshot.get(15)).toBe(2);
    expect(filtered.snapshot.get(20)).toBe(1);
    expect(filtered.snapshot.get(25)).toBe(1);
  });

  it("ReactiveMap intersection incremental updates", () => {
    const c = new Coordinator();
    const input1 = new ZMapChangeInput<string, string>(c);
    const input2 = new ZMapChangeInput<string, string>(c);

    input1.add("k1", "x", 2);
    input1.add("k2", "y", 3);
    input2.add("k1", "x", 4);
    c.step();

    const rm1 = new ReactiveMap(input1);
    const rm2 = new ReactiveMap(input2);
    const intersection = rm1.intersection(rm2);

    expect(intersection.snapshot.getValue("k1", "x")).toBe(8);
    expect(intersection.snapshot.getValue("k2", "y")).toBe(0);

    input2.add("k2", "y", 2);
    c.step();

    expect(intersection.snapshot.getValue("k1", "x")).toBe(8);
    expect(intersection.snapshot.getValue("k2", "y")).toBe(6);
  });

  it("ReactiveMap difference incremental updates", () => {
    const c = new Coordinator();
    const input1 = new ZMapChangeInput<string, string>(c);
    const input2 = new ZMapChangeInput<string, string>(c);

    input1.add("k1", "x", 5);
    input2.add("k1", "x", 3);
    c.step();

    const rm1 = new ReactiveMap(input1);
    const rm2 = new ReactiveMap(input2);
    const diff = rm1.difference(rm2);

    expect(diff.snapshot.getValue("k1", "x")).toBe(2);

    input1.add("k1", "y", 2);
    input2.add("k1", "x", 1);
    c.step();

    expect(diff.snapshot.getValue("k1", "x")).toBe(1);
    expect(diff.snapshot.getValue("k1", "y")).toBe(2);
  });

  it("ReactiveMap filter incremental updates", () => {
    const c = new Coordinator();
    const input = new ZMapChangeInput<string, number>(c);

    input.add("k1", 5, 1);
    input.add("k1", 15, 2);
    input.add("k2", 25, 1);
    c.step();

    const rm = new ReactiveMap(input);
    const filtered = rm.filter((k, v) => v > 10);

    expect(filtered.snapshot.getValue("k1", 5)).toBe(0);
    expect(filtered.snapshot.getValue("k1", 15)).toBe(2);
    expect(filtered.snapshot.getValue("k2", 25)).toBe(1);

    input.add("k1", 20, 3);
    c.step();

    expect(filtered.snapshot.getValue("k1", 15)).toBe(2);
    expect(filtered.snapshot.getValue("k1", 20)).toBe(3);
    expect(filtered.snapshot.getValue("k2", 25)).toBe(1);
  });
});
