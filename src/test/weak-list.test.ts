import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WeakList } from "../weak-list";

class FakeWeakRef<T extends object> {
  private _value: T | undefined;
  constructor(value: T) {
    this._value = value;
  }
  deref(): T | undefined {
    return this._value;
  }
  kill(): void {
    this._value = undefined;
  }
}

describe("WeakList", () => {
  const RealWeakRef = globalThis.WeakRef;

  beforeEach(() => {
    // @ts-expect-error
    globalThis.WeakRef = FakeWeakRef;
  });

  afterEach(() => {
    globalThis.WeakRef = RealWeakRef;
  });

  it("iterates values that were added", () => {
    const wl = new WeakList<{ n: number }>();
    const a = { n: 1 };
    const b = { n: 2 };

    wl.add(a);
    wl.add(b);

    expect([...wl].map((x) => x.n)).toEqual([1, 2]);
  });

  it("skips 'collected' values and compacts the underlying refs", () => {
    const wl = new WeakList<{ id: string }>();

    const a = { id: "a" };
    const b = { id: "b" };

    wl.add(a);
    wl.add(b);

    const items = (wl as any).items as FakeWeakRef<{ id: string }>[];
    items[0]!.kill();

    expect([...wl].map((x) => x.id)).toEqual(["b"]);

    const itemsAfter = (wl as any).items as FakeWeakRef<{ id: string }>[];
    expect(itemsAfter.length).toBe(1);

    expect([...wl].map((x) => x.id)).toEqual(["b"]);
  });

  it("compaction happens during iteration, not during add", () => {
    const wl = new WeakList<{ id: number }>();
    wl.add({ id: 1 });
    wl.add({ id: 2 });

    expect(((wl as any).items as unknown[]).length).toBe(2);

    void [...wl];
    expect(((wl as any).items as unknown[]).length).toBe(2);
  });
});
