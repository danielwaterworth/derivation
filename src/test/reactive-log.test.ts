import { describe, it, expect } from "vitest";
import { List } from "immutable";
import { Coordinator } from "../streaming.js";
import { LogChangeInput } from "../log-change-input.js";
import { ReactiveLog } from "../reactive-log.js";
import { Graph } from "../index.js";
import { ZSet } from "../z-set.js";

describe("ReactiveLog", () => {
  it("accumulates items over steps", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const log = new ReactiveLog(input);

    expect(log.snapshot.size).toBe(0);

    input.push("a");
    input.push("b");
    c.step();

    expect(log.snapshot.toArray()).toEqual(["a", "b"]);

    input.push("c");
    c.step();

    expect(log.snapshot.toArray()).toEqual(["a", "b", "c"]);
  });

  it("tracks changes per step", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const log = new ReactiveLog(input);

    input.push("a");
    c.step();

    expect(log.changes.value.toArray()).toEqual(["a"]);

    input.push("b");
    input.push("c");
    c.step();

    expect(log.changes.value.toArray()).toEqual(["b", "c"]);
  });

  it("tracks previous snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const log = new ReactiveLog(input);

    input.push("a");
    c.step();

    expect(log.previousSnapshot.toArray()).toEqual([]);
    expect(log.snapshot.toArray()).toEqual(["a"]);

    input.push("b");
    c.step();

    expect(log.previousSnapshot.toArray()).toEqual(["a"]);
    expect(log.snapshot.toArray()).toEqual(["a", "b"]);
  });

  it("initializes with snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const initial = List(["x", "y"]);
    const log = new ReactiveLog(input, initial);

    expect(log.snapshot.toArray()).toEqual(["x", "y"]);

    input.push("z");
    c.step();

    expect(log.snapshot.toArray()).toEqual(["x", "y", "z"]);
  });

  it("fold derives state from log", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const log = new ReactiveLog(input);

    const sum = log.fold(0, (acc, item) => acc + item);

    expect(sum.value).toBe(0);

    input.push(1);
    input.push(2);
    c.step();

    expect(sum.value).toBe(3);

    input.push(3);
    c.step();

    expect(sum.value).toBe(6);
  });

  it("fold with initial snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const initial = List([10, 20]);
    const log = new ReactiveLog(input, initial);

    const sum = log.fold(0, (acc, item) => acc + item);

    // Should have folded over snapshot: 0 + 10 + 20 = 30
    expect(sum.value).toBe(30);

    input.push(5);
    c.step();

    // Now: 30 + 5 = 35
    expect(sum.value).toBe(35);
  });

  it("works with Graph.inputLog", () => {
    const graph = new Graph();
    const log = graph.inputLog<string>();

    log.push("hello");
    graph.step();

    expect(log.snapshot.toArray()).toEqual(["hello"]);

    log.push("world");
    graph.step();

    expect(log.snapshot.toArray()).toEqual(["hello", "world"]);
  });

  it("pushAll adds multiple items", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const log = new ReactiveLog(input);

    input.pushAll(List(["a", "b", "c"]));
    c.step();

    expect(log.snapshot.toArray()).toEqual(["a", "b", "c"]);
  });

  it("length tracks count from changes only", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const log = new ReactiveLog(input);

    expect(log.length.value).toBe(0);

    input.push("a");
    input.push("b");
    c.step();

    expect(log.length.value).toBe(2);

    input.push("c");
    c.step();

    expect(log.length.value).toBe(3);
  });

  it("length initializes with snapshot size", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<string>(c);
    const initial = List(["x", "y", "z"]);
    const log = new ReactiveLog(input, initial);

    expect(log.length.value).toBe(3);

    input.push("w");
    c.step();

    expect(log.length.value).toBe(4);
  });

  it("map transforms log items", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const log = new ReactiveLog(input);

    const doubled = log.map((x) => x * 2);

    input.push(1);
    input.push(2);
    c.step();

    expect(doubled.snapshot.toArray()).toEqual([2, 4]);

    input.push(3);
    c.step();

    expect(doubled.snapshot.toArray()).toEqual([2, 4, 6]);
  });

  it("map with initial snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const initial = List([10, 20]);
    const log = new ReactiveLog(input, initial);

    const doubled = log.map((x) => x * 2);

    expect(doubled.snapshot.toArray()).toEqual([20, 40]);

    input.push(5);
    c.step();

    expect(doubled.snapshot.toArray()).toEqual([20, 40, 10]);
  });

  it("filter selects log items", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const log = new ReactiveLog(input);

    const evens = log.filter((x) => x % 2 === 0);

    input.push(1);
    input.push(2);
    input.push(3);
    input.push(4);
    c.step();

    expect(evens.snapshot.toArray()).toEqual([2, 4]);

    input.push(5);
    input.push(6);
    c.step();

    expect(evens.snapshot.toArray()).toEqual([2, 4, 6]);
  });

  it("filter with initial snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<number>(c);
    const initial = List([1, 2, 3, 4]);
    const log = new ReactiveLog(input, initial);

    const evens = log.filter((x) => x % 2 === 0);

    expect(evens.snapshot.toArray()).toEqual([2, 4]);

    input.push(6);
    c.step();

    expect(evens.snapshot.toArray()).toEqual([2, 4, 6]);
  });

  it("toSet converts log of ZSets to ReactiveSet", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<ZSet<string>>(c);
    const log = new ReactiveLog(input);

    const set = log.toSet();

    expect([...set.snapshot.getEntries()]).toEqual([]);

    // Add items
    input.push(new ZSet<string>().add("a").add("b"));
    c.step();

    expect(set.snapshot.get("a")).toBe(1);
    expect(set.snapshot.get("b")).toBe(1);
    expect(set.snapshot.length).toBe(2);

    // Add more and remove one
    input.push(new ZSet<string>().add("c").add("a", -1));
    c.step();

    expect(set.snapshot.get("a")).toBe(0);
    expect(set.snapshot.get("b")).toBe(1);
    expect(set.snapshot.get("c")).toBe(1);
    expect(set.snapshot.length).toBe(2);
  });

  it("toSet with initial snapshot", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<ZSet<string>>(c);
    const initial = List([new ZSet<string>().add("x").add("y")]);
    const log = new ReactiveLog(input, initial);

    const set = log.toSet();

    expect(set.snapshot.get("x")).toBe(1);
    expect(set.snapshot.get("y")).toBe(1);
    expect(set.snapshot.length).toBe(2);

    input.push(new ZSet<string>().add("z"));
    c.step();

    expect(set.snapshot.get("x")).toBe(1);
    expect(set.snapshot.get("y")).toBe(1);
    expect(set.snapshot.get("z")).toBe(1);
    expect(set.snapshot.length).toBe(3);
  });

  it("toSet tracks changes correctly", () => {
    const c = new Coordinator();
    const input = new LogChangeInput<ZSet<string>>(c);
    const log = new ReactiveLog(input);

    const set = log.toSet();

    input.push(new ZSet<string>().add("a"));
    c.step();

    expect(set.changes.value.get("a")).toBe(1);
    expect(set.changes.value.length).toBe(1);

    input.push(new ZSet<string>().add("b").add("a", -1));
    c.step();

    expect(set.changes.value.get("b")).toBe(1);
    expect(set.changes.value.get("a")).toBe(-1);
    expect(set.changes.value.length).toBe(2);
  });
});
