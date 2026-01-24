import { FractionalIndex } from "./fractional-index.js";
import { DirtySet } from "./dirty-set.js";
import { Dependents } from "./dependents.js";

export abstract class ReactiveValue<T> {
  index!: FractionalIndex;
  private readonly dependents = new Dependents<ReactiveValue<unknown>>();

  abstract step(): void;
  dispose(): void {
    this.graph.removeValue(this);
  }
  abstract get value(): T;
  abstract get graph(): Graph;

  addDependent(dependent: ReactiveValue<unknown>): void {
    this.dependents.add(dependent);
  }

  removeDependent(dependent: ReactiveValue<unknown>): void {
    this.dependents.delete(dependent);
  }

  protected invalidateDependents(): void {
    for (const dependent of this.dependents) {
      this.graph.markDirty(dependent);
    }
  }

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
  private dirtySet = new DirtySet();
  private dirtyNextStep = new DirtySet();
  private readonly streamsTable = new WeakMap<ReactiveValue<unknown>, void>();
  private readonly callbacks: (() => void)[] = [];
  private readonly externals = new Set<ReactiveValue<unknown>>();
  private nextGlobalIndex = 0;
  private nextNegativeIndex = -1;
  private lastProcessedNode: ReactiveValue<unknown> | null = null;
  private nextPrefix: ReadonlyArray<number> | null = null;
  private nextIndex = 0;
  private lastProcessedStream: ReactiveValue<unknown> | null = null;
  private stepping = false;

  step(): void {
    this.stepping = true;
    // Swap dirty sets
    const temp = this.dirtySet;
    this.dirtySet = this.dirtyNextStep;
    this.dirtyNextStep = temp;
    // Mark all externals as dirty
    for (const external of this.externals) {
      this.dirtySet.add(external);
    }
    this.lastProcessedStream = null;

    let stream;
    while ((stream = this.dirtySet.pop()) !== undefined) {
      if (this.streamsTable.has(stream)) {
        // Validate topological order
        if (this.lastProcessedStream !== null) {
          if (!this.lastProcessedStream.index.lessThan(stream.index)) {
            throw new Error(
              `Stream index ${stream.index.toString()} must be greater than last processed index ${this.lastProcessedStream.index.toString()}`
            );
          }
        }
        this.lastProcessedStream = stream;
        this.lastProcessedNode = stream;
        this.nextPrefix = null;
        this.nextIndex = 0;
        stream.step();
      }
    }
    this.lastProcessedNode = null;
    this.nextPrefix = null;
    this.nextIndex = 0;
    this.stepping = false;
    for (const callback of this.callbacks) {
      callback();
    }
  }

  removeValue(s: ReactiveValue<unknown>): void {
    this.streamsTable.delete(s);
  }

  addValue(s: ReactiveValue<unknown>): void {
    if (!this.stepping) {
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
    this.streamsTable.set(s, undefined);
  }

  afterStep(callback: () => void): void {
    this.callbacks.push(callback);
  }

  markDirty(s: ReactiveValue<unknown>): void {
    this.dirtySet.add(s);
  }

  markDirtyNextStep(s: ReactiveValue<unknown>): void {
    this.dirtyNextStep.add(s);
  }

  addExternal(s: ReactiveValue<unknown>): void {
    this.externals.add(s);
  }

  removeExternal(s: ReactiveValue<unknown>): void {
    this.externals.delete(s);
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
    const oldValue = this._value;
    this._value = this.nextValue;
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  setNextValue(v: T): void {
    if (this.nextValue !== v) {
      this.nextValue = v;
      this.graph.markDirtyNextStep(this);
    }
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
    input.addDependent(this);
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
    input.addDependent(this);
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
    input.addDependent(this);
    graph.addValue(this);
  }

  step(): void {
    const oldValue = this._value;
    this._value = this.func(this.input.value);
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
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
    inputA.addDependent(this);
    inputB.addDependent(this);
    graph.addValue(this);
  }

  step(): void {
    const oldValue = this._value;
    this._value = this.func(this.inputA.value, this.inputB.value);
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    return this._value;
  }
}

export class FlattenStream<T> extends ReactiveValue<T> {
  private _value: T;
  private currentInner: ReactiveValue<T>;

  constructor(
    private readonly outer: ReactiveValue<ReactiveValue<T>>,
    public readonly graph: Graph,
  ) {
    super();
    this.currentInner = outer.value;
    this._value = this.currentInner.value;
    outer.addDependent(this);
    this.currentInner.addDependent(this);
    graph.addValue(this);
  }

  step(): void {
    const newInner = this.outer.value;
    if (newInner !== this.currentInner) {
      this.currentInner.removeDependent(this);
      this.currentInner = newInner;
      this.currentInner.addDependent(this);
    }
    const oldValue = this._value;
    this._value = this.currentInner.value;
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    return this._value;
  }
}
