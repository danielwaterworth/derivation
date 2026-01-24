import { WeakList } from "./weak-list.js";
import { FractionalIndex } from "./fractional-index.js";
import { DirtySet } from "./dirty-set.js";

export abstract class ReactiveValue<T> {
  index!: FractionalIndex;

  abstract step(): void;
  dispose(): void {
    this.graph.removeValue(this);
  }
  abstract get value(): T;
  abstract get graph(): Graph;

  map<A>(f: (t: T) => A): ReactiveValue<A> {
    return new MapStream(this, f, this.graph);
  }

  zip<A, B>(other: ReactiveValue<A>, f: (t: T, a: A) => B): ReactiveValue<B> {
    return new ZipStream(this, other, f, this.graph);
  }

  zip2<A, B, C>(
    other1: ReactiveValue<A>,
    other2: ReactiveValue<B>,
    f: (t: T, a: A, b: B) => C,
  ): ReactiveValue<C> {
    return this.zip(other1, (t, a) => [t, a] as const).zip(other2, (x, b) =>
      f(x[0], x[1], b),
    );
  }

  zip3<A, B, C, D>(
    other1: ReactiveValue<A>,
    other2: ReactiveValue<B>,
    other3: ReactiveValue<C>,
    f: (t: T, a: A, b: B, c: C) => D,
  ): ReactiveValue<D> {
    return this.zip2(other1, other2, (t, a, b) => [t, a, b] as const).zip(
      other3,
      (x, c) => f(x[0], x[1], x[2], c),
    );
  }

  zip4<A, B, C, D, E>(
    other1: ReactiveValue<A>,
    other2: ReactiveValue<B>,
    other3: ReactiveValue<C>,
    other4: ReactiveValue<D>,
    f: (t: T, a: A, b: B, c: C, d: D) => E,
  ): ReactiveValue<E> {
    return this.zip3(
      other1,
      other2,
      other3,
      (t, a, b, c) => [t, a, b, c] as const,
    ).zip(other4, (x, d) => f(x[0], x[1], x[2], x[3], d));
  }

  zip5<A, B, C, D, E, F>(
    other1: ReactiveValue<A>,
    other2: ReactiveValue<B>,
    other3: ReactiveValue<C>,
    other4: ReactiveValue<D>,
    other5: ReactiveValue<E>,
    f: (t: T, a: A, b: B, c: C, d: D, e: E) => F,
  ): ReactiveValue<F> {
    return this.zip4(
      other1,
      other2,
      other3,
      other4,
      (t, a, b, c, d) => [t, a, b, c, d] as const,
    ).zip(other5, (x, e) => f(x[0], x[1], x[2], x[3], x[4], e));
  }

  accumulate<A>(initial: A, func: (acc: A, t: T) => A): ReactiveValue<A> {
    const internal = new Register<A>(initial, this.graph);
    const output = internal.zip(this, func);
    internal.setInput(output);
    return output;
  }

  sink(cb: (t: T) => void): ReactiveValue<unknown> {
    return new SinkStream(this, cb, this.graph);
  }

  delay(t: T): ReactiveValue<T> {
    const r = new Register<T>(t, this.graph);
    r.setInput(this);
    return r;
  }

  flatten<X>(this: ReactiveValue<ReactiveValue<X>>): ReactiveValue<X> {
    return new FlattenStream(this, this.graph);
  }
}

export class Graph {
  private front = new WeakList<ReactiveValue<unknown>>();
  private back = new DirtySet();
  private readonly streamsTable = new WeakMap<ReactiveValue<unknown>, void>();
  private readonly callbacks: (() => void)[] = [];
  private nextGlobalIndex = 0;
  private nextNegativeIndex = -1;
  private lastProcessedNode: ReactiveValue<unknown> | null = null;
  private nextPrefix: ReadonlyArray<number> | null = null;
  private nextIndex = 0;
  private lastAddedToFront: ReactiveValue<unknown> | null = null;

  private addToFront(stream: ReactiveValue<unknown>): void {
    if (this.lastAddedToFront !== null) {
      if (!this.lastAddedToFront.index.lessThan(stream.index)) {
        throw new Error(
          `Stream index ${stream.index.toString()} must be greater than last added index ${this.lastAddedToFront.index.toString()}`
        );
      }
    }
    this.front.push(stream);
    this.lastAddedToFront = stream;
  }

  step(): void {
    // Build dirty set from front list
    this.back = new DirtySet();
    for (const stream of this.front) {
      this.back.add(stream);
    }
    this.front = new WeakList();
    this.lastAddedToFront = null;

    let stream;
    while ((stream = this.back.pop()) !== undefined) {
      if (this.streamsTable.has(stream)) {
        stream.step();
        this.lastProcessedNode = stream;
        this.nextPrefix = null;
        this.nextIndex = 0;
        this.addToFront(stream);
      }
    }
    this.lastProcessedNode = null;
    this.nextPrefix = null;
    this.nextIndex = 0;
    for (const callback of this.callbacks) {
      callback();
    }
  }

  removeValue(s: ReactiveValue<unknown>): void {
    this.streamsTable.delete(s);
  }

  addValue(s: ReactiveValue<unknown>): void {
    if (this.back.isEmpty()) {
      // Outside step - normal positive indices
      s.index = new FractionalIndex(this.nextGlobalIndex++);
    } else {
      // Inside step
      if (this.lastProcessedNode === null) {
        // Before processing any nodes - use negative indices
        s.index = new FractionalIndex(this.nextNegativeIndex--);
      } else {
        // During step - split last processed node's index
        if (this.nextPrefix === null) {
          // First child: create split
          this.nextPrefix = this.lastProcessedNode.index.getParts();
          this.lastProcessedNode.index = new FractionalIndex([
            ...this.nextPrefix,
            1,
          ]);
          this.nextIndex = 2;
        } else {
          this.nextIndex++;
        }
        s.index = new FractionalIndex([...this.nextPrefix, this.nextIndex]);
      }
    }
    this.addToFront(s);
    this.streamsTable.set(s, undefined);
  }

  afterStep(callback: () => void): void {
    this.callbacks.push(callback);
  }
}

export class Register<T> extends ReactiveValue<T> {
  private _value: T;
  private nextValue: T;
  private samplerStream: Sampler<T> | null = null;

  constructor(
    t: T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = t;
    this.nextValue = t;
    graph.addValue(this);
  }

  dispose(): void {
    this.graph.removeValue(this);
    if (this.samplerStream) this.graph.removeValue(this.samplerStream);
  }

  step(): void {
    this._value = this.nextValue;
  }

  setNextValue(v: T): void {
    this.nextValue = v;
  }

  setInput(input: ReactiveValue<T>): void {
    if (this.samplerStream) throw new Error("Register already has input");
    this.samplerStream = new Sampler(input, this, this.graph);
  }

  get value(): T {
    return this._value;
  }
}

export class Sampler<T> extends ReactiveValue<void> {
  constructor(
    private readonly input: ReactiveValue<T>,
    private readonly register: Register<T>,
    public readonly graph: Graph,
  ) {
    super();
    this.step();
    graph.addValue(this);
  }

  step(): void {
    this.register.setNextValue(this.input.value);
  }

  dispose(): void {
    this.graph.removeValue(this.register);
    this.graph.removeValue(this);
  }

  get value(): void {
    return undefined;
  }
}

export class SinkStream<T> extends ReactiveValue<void> {
  constructor(
    private readonly input: ReactiveValue<T>,
    private readonly cb: (t: T) => void,
    public readonly graph: Graph,
  ) {
    super();
    graph.addValue(this);
    this.step();
  }

  step(): void {
    this.cb(this.input.value);
  }

  get value(): void {
    return undefined;
  }
}

export class MapStream<A, T> extends ReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly input: ReactiveValue<A>,
    private readonly func: (a: A) => T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = func(input.value);
    graph.addValue(this);
  }

  step(): void {
    this._value = this.func(this.input.value);
  }

  get value(): T {
    return this._value;
  }
}

export class ZipStream<A, B, T> extends ReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly inputA: ReactiveValue<A>,
    private readonly inputB: ReactiveValue<B>,
    private readonly func: (a: A, b: B) => T,
    public readonly graph: Graph,
  ) {
    super();
    this._value = func(inputA.value, inputB.value);
    graph.addValue(this);
  }

  step(): void {
    this._value = this.func(this.inputA.value, this.inputB.value);
  }

  get value(): T {
    return this._value;
  }
}

export class FlattenStream<T> extends ReactiveValue<T> {
  private _value: T;

  constructor(
    private readonly outer: ReactiveValue<ReactiveValue<T>>,
    public readonly graph: Graph,
  ) {
    super();
    this._value = outer.value.value;
    graph.addValue(this);
  }

  step(): void {
    this._value = this.outer.value.value;
  }

  get value(): T {
    return this._value;
  }
}
