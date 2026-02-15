import { describe, expect, it } from "vitest";
import * as api from "../index.js";
import * as internalApi from "../internal.js";
import {
  Graph,
  constantValue,
  inputValue,
  counterValue,
  ReactiveValue,
} from "../index.js";

describe("ReactiveValue wrapper", () => {
  it("does not expose internal node classes from the public API", () => {
    expect(api).not.toHaveProperty("InternalReactiveValue");
    expect(api).not.toHaveProperty("InternalInput");
    expect(api).not.toHaveProperty("InternalCounterInput");
  });

  it("exposes internal node classes from the internal API", () => {
    expect(internalApi).toHaveProperty("InternalReactiveValue");
  });

  it("public constructors return observer wrappers with chainable operators", () => {
    const g = new Graph();
    const src = inputValue(g, 1);

    const mapped = src.map((x) => x * 2);

    expect(mapped.value).toBe(2);
    src.push(3);
    g.step();
    expect(mapped.value).toBe(6);
  });

  it("sink can be disposed deterministically", () => {
    const g = new Graph();
    const src = inputValue(g, 0);
    const seen: number[] = [];
    const sink = src.sink((x) => seen.push(x));

    expect(seen).toEqual([0]);
    src.push(1);
    g.step();
    expect(seen).toEqual([0, 1]);

    sink.dispose();
    src.push(2);
    g.step();
    expect(seen).toEqual([0, 1]);
  });

  it("counter wrapper forwards add", () => {
    const g = new Graph();
    const counter = counterValue(g);

    counter.add(4);
    g.step();
    expect(counter.value).toBe(4);
  });

  it("input handle keeps source node alive after last dependent is disposed", () => {
    const g = new Graph();
    const src = inputValue(g, 1);
    const derived = src.map((x) => x * 2);

    expect(derived.value).toBe(2);
    derived.dispose();

    src.push(3);
    g.step();
    expect(src.value).toBe(3);
  });

  it("counter handle keeps source node alive after last dependent is disposed", () => {
    const g = new Graph();
    const counter = counterValue(g);
    const derived = counter.map((x) => x + 1);

    expect(derived.value).toBe(1);
    derived.dispose();

    counter.add(5);
    g.step();
    expect(counter.value).toBe(5);
  });

  it("disposed input handle can no longer push", () => {
    const g = new Graph();
    const src = inputValue(g, 0);
    const seen: number[] = [];
    src.sink((x) => seen.push(x));

    expect(seen).toEqual([0]);
    src.dispose();
    expect(() => src.push(1)).toThrow();
    g.step();
    expect(seen).toEqual([0]);
  });

  it("disposed counter handle can no longer add", () => {
    const g = new Graph();
    const counter = counterValue(g);
    const seen: number[] = [];
    counter.sink((x) => seen.push(x));

    expect(seen).toEqual([0]);
    counter.dispose();
    expect(() => counter.add(2)).toThrow();
    g.step();
    expect(seen).toEqual([0]);
  });

  it("disposed wrapper rejects reads and stream operations", () => {
    const g = new Graph();
    const src = inputValue(g, 1);
    const other = constantValue(g, 2);

    src.dispose();

    expect(() => src.value).toThrow("Cannot resolve a disposed observer");
    expect(() => src.graph).toThrow("Cannot resolve a disposed observer");
    expect(() => src.map((x) => x + 1)).toThrow(
      "Cannot resolve a disposed observer",
    );
    expect(() => src.zip(other, (x, y) => x + y)).toThrow(
      "Cannot resolve a disposed observer",
    );
    expect(() => src.accumulate(0, (acc, x) => acc + x)).toThrow(
      "Cannot resolve a disposed observer",
    );
    expect(() => src.sink(() => undefined)).toThrow(
      "Cannot resolve a disposed observer",
    );
    expect(() => src.delay(0)).toThrow("Cannot resolve a disposed observer");
  });

  it("wrapper release tears down unshared derived nodes", () => {
    const g = new Graph();
    const base = constantValue(g, 10);
    const derived = base.map((x) => x + 1);

    expect(derived.resolve((node) => node.value)).toBe(11);

    derived.dispose();
    expect(() => derived.resolve((node) => node.value)).toThrow(
      "Cannot resolve a disposed observer",
    );
  });

  it("fromNode returns distinct wrappers for the same node", () => {
    const g = new Graph();
    const base = constantValue(g, 10);

    const again = base.resolve((node) => ReactiveValue.fromNode(node));
    expect(again).not.toBe(base);
    expect(again.value).toBe(10);

    again.dispose();
    base.dispose();
  });

  it("disposing one wrapper does not release other wrappers for the same node", () => {
    const g = new Graph();
    const base = constantValue(g, 10);
    const second = base.resolve((node) => ReactiveValue.fromNode(node));

    base.dispose();
    expect(() => base.value).toThrow("Cannot resolve a disposed observer");
    expect(second.value).toBe(10);

    second.dispose();
    expect(() => second.value).toThrow("Cannot resolve a disposed observer");
  });

  it("clone creates an independent wrapper for the same node", () => {
    const g = new Graph();
    const base = constantValue(g, 10);
    const clone = base.clone();

    expect(clone).not.toBe(base);
    expect(clone.value).toBe(10);

    base.dispose();
    expect(() => base.value).toThrow("Cannot resolve a disposed observer");
    expect(clone.value).toBe(10);

    clone.dispose();
    expect(() => clone.value).toThrow("Cannot resolve a disposed observer");
  });

  it("clone on disposed wrapper throws", () => {
    const g = new Graph();
    const base = constantValue(g, 10);
    base.dispose();

    expect(() => base.clone()).toThrow("Cannot resolve a disposed observer");
  });
});
