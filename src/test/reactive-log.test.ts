import { describe, it, expect } from "vitest";
import { List } from "immutable";
import { Coordinator } from "../streaming.js";
import { LogChangeInput } from "../log-change-input.js";
import { ReactiveLog } from "../reactive-log.js";
import { Graph } from "../index.js";

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
});
