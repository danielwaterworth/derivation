import { describe, expect, it } from "vitest";
import {
  Graph,
  constantValue,
  counterValue,
  inputValue,
  ReactiveValue,
} from "../index.js";
import { Register } from "../streaming.js";

describe("public operator coverage", () => {
  it("wrapper zip2/zip3/zip4/zip5 combine values", () => {
    const g = new Graph();
    const a = constantValue(g, 1);
    const b = constantValue(g, 2);
    const c = constantValue(g, 3);
    const d = constantValue(g, 4);
    const e = constantValue(g, 5);
    const f = constantValue(g, 6);

    expect(a.zip2(b, c, (x, y, z) => x + y + z).value).toBe(6);
    expect(a.zip3(b, c, d, (w, x, y, z) => w + x + y + z).value).toBe(10);
    expect(a.zip4(b, c, d, e, (v, w, x, y, z) => v + w + x + y + z).value).toBe(
      15,
    );
    expect(
      a.zip5(b, c, d, e, f, (u, v, w, x, y, z) => u + v + w + x + y + z).value,
    ).toBe(21);
  });

  it("input only invalidates dependents when the value changes", () => {
    const g = new Graph();
    const src = inputValue(g, 1);
    let computes = 0;

    const mapped = src.map((x) => {
      computes += 1;
      return x * 10;
    });

    expect(computes).toBe(1);

    src.push(1);
    g.step();
    expect(computes).toBe(1);

    src.push(2);
    g.step();
    expect(computes).toBe(2);

    mapped.dispose();
  });

  it("counter accumulates adds before step and resets after each step", () => {
    const g = new Graph();
    const counter = counterValue(g);

    counter.add(2);
    counter.add(3);
    expect(counter.value).toBe(0);

    g.step();
    expect(counter.value).toBe(5);

    g.step();
    expect(counter.value).toBe(0);
  });

  it("register rejects setting an input twice", () => {
    const g = new Graph();
    const src = constantValue(g, 1);
    const reg = new Register(0, g);

    reg.setInput(src.resolve((node) => node));

    expect(() => reg.setInput(src.resolve((node) => node))).toThrow(
      "Register already has input",
    );
  });

  it("bind throws if callback returns a disposed wrapper initially", () => {
    const g = new Graph();
    const selector = constantValue(g, true);
    const inner = constantValue(g, 42);
    inner.dispose();

    expect(() => selector.bind(() => inner)).toThrow(
      "received disposed ReactiveValue.",
    );
  });

  it("zip throws when the other wrapper is disposed", () => {
    const g = new Graph();
    const left = constantValue(g, 1);
    const right = constantValue(g, 2);
    right.dispose();

    expect(() => left.zip(right, (a, b) => a + b)).toThrow(
      "Cannot resolve a disposed observer",
    );
  });

  it("fromNode retains and releases observers consistently", () => {
    const g = new Graph();
    const base = constantValue(g, 10);
    const extra = base.resolve((node) => ReactiveValue.fromNode(node));

    expect(base.value).toBe(10);
    expect(extra.value).toBe(10);

    base.dispose();
    expect(extra.value).toBe(10);

    extra.dispose();
    expect(() => extra.value).toThrow("Cannot resolve a disposed observer");
  });
});
