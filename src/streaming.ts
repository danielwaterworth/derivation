import { DirtySet } from "./dirty-set.js";

type PushableReactiveValue<T> = InternalReactiveValue<T> & {
  push(value: T): void;
};
type AddableReactiveValue = InternalReactiveValue<number> & {
  add(weight: number): void;
};

const gcObserverRegistry:
  | FinalizationRegistry<InternalReactiveValue<unknown>>
  | undefined =
  typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((node) => {
        node.releaseObserver();
      });

export abstract class InternalReactiveValue<T> {
  height = 0;
  private readonly dependents = new Set<InternalReactiveValue<unknown>>();
  private readonly keepAliveDependents = new Set<
    InternalReactiveValue<unknown>
  >();
  private readonly trackedInputs: InternalReactiveValue<unknown>[] = [];
  private disposed = false;
  private observerCount = 0;

  abstract step(): void;
  abstract get value(): T;
  abstract get graph(): Graph;

  dispose(): void {
    this.forceDispose();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  protected assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error("Cannot access a disposed reactive value");
    }
  }

  private forceDispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.graph.removeValue(this);
    this.observerCount = 0;

    for (const input of this.trackedInputs) {
      input.removeDependent(this);
    }
    this.trackedInputs.length = 0;

    this.onDisposed();
  }

  retainObserver(): void {
    if (this.disposed) return;
    this.observerCount += 1;
  }

  releaseObserver(): void {
    if (this.observerCount > 0) {
      this.observerCount -= 1;
    }
    this.maybeDisposeIfUnreferenced();
  }

  protected onDisposed(): void {}

  private maybeDisposeIfUnreferenced(): void {
    if (this.disposed) return;
    if (this.observerCount > 0) return;
    if (this.keepAliveDependents.size > 0) return;
    this.forceDispose();
  }

  protected trackInput<A>(
    input: InternalReactiveValue<A>,
    options: { keepsAlive?: boolean } = {},
  ): InternalReactiveValue<A> {
    input.addDependent(this, options);
    this.trackedInputs.push(input);
    return input;
  }

  protected untrackInput(input: InternalReactiveValue<unknown>): void {
    const idx = this.trackedInputs.indexOf(input);
    if (idx >= 0) {
      this.trackedInputs.splice(idx, 1);
    }
    input.removeDependent(this);
  }

  addDependent(
    dependent: InternalReactiveValue<unknown>,
    options: { keepsAlive?: boolean } = {},
  ): void {
    if (this.disposed) return;
    this.dependents.add(dependent);
    if (options.keepsAlive !== false) {
      this.keepAliveDependents.add(dependent);
    }
    dependent.ensureHeight(this.height + 1);
  }

  removeDependent(dependent: InternalReactiveValue<unknown>): void {
    this.dependents.delete(dependent);
    this.keepAliveDependents.delete(dependent);
    this.maybeDisposeIfUnreferenced();
  }

  protected invalidateDependents(): void {
    for (const dependent of this.dependents) {
      this.graph.markDirty(dependent);
    }
  }

  ensureHeight(minHeight: number): void {
    if (this.disposed) return;
    if (this.height >= minHeight) return;
    this.height = minHeight;
    this.graph.onHeightIncreased();
    for (const dependent of this.dependents) {
      dependent.ensureHeight(minHeight + 1);
    }
  }

  map<A>(f: (t: T) => A): InternalReactiveValue<A> {
    return new MapStream(this, f, this.graph);
  }

  zip<A, B>(
    other: InternalReactiveValue<A>,
    f: (t: T, a: A) => B,
  ): InternalReactiveValue<B> {
    return new ZipStream(this, other, f, this.graph);
  }

  zip2<A, B, C>(
    other1: InternalReactiveValue<A>,
    other2: InternalReactiveValue<B>,
    f: (t: T, a: A, b: B) => C,
  ): InternalReactiveValue<C> {
    return this.zip(other1, (t, a) => [t, a] as const).zip(other2, (x, b) =>
      f(x[0], x[1], b),
    );
  }

  zip3<A, B, C, D>(
    other1: InternalReactiveValue<A>,
    other2: InternalReactiveValue<B>,
    other3: InternalReactiveValue<C>,
    f: (t: T, a: A, b: B, c: C) => D,
  ): InternalReactiveValue<D> {
    return this.zip2(other1, other2, (t, a, b) => [t, a, b] as const).zip(
      other3,
      (x, c) => f(x[0], x[1], x[2], c),
    );
  }

  zip4<A, B, C, D, E>(
    other1: InternalReactiveValue<A>,
    other2: InternalReactiveValue<B>,
    other3: InternalReactiveValue<C>,
    other4: InternalReactiveValue<D>,
    f: (t: T, a: A, b: B, c: C, d: D) => E,
  ): InternalReactiveValue<E> {
    return this.zip3(
      other1,
      other2,
      other3,
      (t, a, b, c) => [t, a, b, c] as const,
    ).zip(other4, (x, d) => f(x[0], x[1], x[2], x[3], d));
  }

  zip5<A, B, C, D, E, F>(
    other1: InternalReactiveValue<A>,
    other2: InternalReactiveValue<B>,
    other3: InternalReactiveValue<C>,
    other4: InternalReactiveValue<D>,
    other5: InternalReactiveValue<E>,
    f: (t: T, a: A, b: B, c: C, d: D, e: E) => F,
  ): InternalReactiveValue<F> {
    return this.zip4(
      other1,
      other2,
      other3,
      other4,
      (t, a, b, c, d) => [t, a, b, c, d] as const,
    ).zip(other5, (x, e) => f(x[0], x[1], x[2], x[3], x[4], e));
  }

  accumulate<A>(
    initial: A,
    func: (acc: A, t: T) => A,
  ): InternalReactiveValue<A> {
    const internal = new Register<A>(initial, this.graph);
    const output = internal.zip(this, func);
    internal.setInput(output, false);
    return output;
  }

  sink(cb: (t: T) => void): InternalReactiveValue<unknown> {
    return new SinkStream(this, cb, this.graph);
  }

  delay(t: T): InternalReactiveValue<T> {
    const r = new Register<T>(t, this.graph);
    r.setInput(this);
    return r;
  }

  bind<X>(func: (value: T) => ReactiveValue<X>): InternalReactiveValue<X> {
    return new BindStream(this, func, this.graph);
  }
}

export class ReactiveValue<T> {
  private released = false;

  constructor(protected readonly node: InternalReactiveValue<T>) {
    this.node.retainObserver();
    gcObserverRegistry?.register(
      this,
      node as InternalReactiveValue<unknown>,
      this,
    );
  }

  static fromNode<T>(node: InternalReactiveValue<T>): ReactiveValue<T> {
    return new ReactiveValue(node);
  }

  resolve<X>(f: (value: InternalReactiveValue<T>) => X): X {
    if (this.released) {
      throw new Error("Cannot resolve a disposed observer");
    }
    return f(this.node);
  }

  dispose(): void {
    if (this.released) return;
    this.released = true;
    gcObserverRegistry?.unregister(this);
    this.node.releaseObserver();
  }

  get isReleased(): boolean {
    return this.released;
  }

  clone(): ReactiveValue<T> {
    return this.resolve((node) => ReactiveValue.fromNode(node));
  }

  get value(): T {
    return this.resolve((node) => node.value);
  }

  get graph(): Graph {
    return this.resolve((node) => node.graph);
  }

  map<A>(f: (t: T) => A): ReactiveValue<A> {
    return this.resolve((node) => ReactiveValue.fromNode(node.map(f)));
  }

  zip<A, B>(other: ReactiveValue<A>, f: (t: T, a: A) => B): ReactiveValue<B> {
    return this.resolve((node) =>
      other.resolve((otherNode) =>
        ReactiveValue.fromNode(node.zip(otherNode, f)),
      ),
    );
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
    return this.resolve((node) =>
      ReactiveValue.fromNode(node.accumulate(initial, func)),
    );
  }

  sink(cb: (t: T) => void): ReactiveValue<unknown> {
    return this.resolve((node) => ReactiveValue.fromNode(node.sink(cb)));
  }

  delay(t: T): ReactiveValue<T> {
    return this.resolve((node) => ReactiveValue.fromNode(node.delay(t)));
  }

  bind<X>(func: (value: T) => ReactiveValue<X>): ReactiveValue<X> {
    return this.resolve((node) => ReactiveValue.fromNode(node.bind(func)));
  }
}

export class Input<T> extends ReactiveValue<T> {
  constructor(node: PushableReactiveValue<T>) {
    super(node);
  }

  push(value: T): void {
    this.resolve((node) => (node as PushableReactiveValue<T>).push(value));
  }
}

export class Counter extends ReactiveValue<number> {
  constructor(node: AddableReactiveValue) {
    super(node);
  }

  add(weight: number): void {
    this.resolve((node) => (node as AddableReactiveValue).add(weight));
  }
}

export class Graph {
  private dirtySet = new DirtySet();
  private dirtyNextStep = new DirtySet();
  private readonly callbacks: (() => void)[] = [];
  private readonly externals = new Set<InternalReactiveValue<unknown>>();
  private lastProcessedStream: InternalReactiveValue<unknown> | null = null;
  private stepping = false;

  step(): void {
    this.stepping = true;
    const temp = this.dirtySet;
    this.dirtySet = this.dirtyNextStep;
    this.dirtyNextStep = temp;

    for (const external of this.externals) {
      this.dirtySet.add(external);
    }
    this.lastProcessedStream = null;

    let stream;
    let lastProcessedHeight = -1;
    while ((stream = this.dirtySet.pop()) !== undefined) {
      if (!stream.isDisposed) {
        if (lastProcessedHeight >= 0) {
          if (lastProcessedHeight > stream.height) {
            throw new Error(
              `Stream height ${stream.height} must be >= last processed height ${lastProcessedHeight}`,
            );
          }
        }
        lastProcessedHeight = stream.height;
        this.lastProcessedStream = stream;
        stream.step();
      }
    }
    this.stepping = false;
    for (const callback of this.callbacks) {
      callback();
    }
  }

  removeValue(s: InternalReactiveValue<unknown>): void {
    this.externals.delete(s);
    this.dirtySet.delete(s);
    this.dirtyNextStep.delete(s);
  }

  addValue(_s: InternalReactiveValue<unknown>): void {}

  afterStep(callback: () => void): void {
    this.callbacks.push(callback);
  }

  onHeightIncreased(): void {
    this.dirtySet.rebuild();
    this.dirtyNextStep.rebuild();
  }

  markDirty(s: InternalReactiveValue<unknown>): void {
    if (s.isDisposed) return;

    if (
      this.stepping &&
      this.lastProcessedStream !== null &&
      s.height < this.lastProcessedStream.height
    ) {
      throw new Error(
        `Cannot mark dirty value with height ${s.height} before last processed height ${this.lastProcessedStream.height}`,
      );
    }
    this.dirtySet.add(s);
  }

  markDirtyNextStep(s: InternalReactiveValue<unknown>): void {
    if (s.isDisposed) return;
    this.dirtyNextStep.add(s);
  }

  addExternal(s: InternalReactiveValue<unknown>): void {
    this.externals.add(s);
  }

  removeExternal(s: InternalReactiveValue<unknown>): void {
    this.externals.delete(s);
  }
}

export class Register<T> extends InternalReactiveValue<T> {
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

  protected override onDisposed(): void {
    if (this.samplerStream !== null) {
      this.samplerStream.dispose();
      this.samplerStream = null;
    }
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

  setInput(input: InternalReactiveValue<T>, keepInputAlive = true): void {
    if (this.samplerStream) throw new Error("Register already has input");
    this.samplerStream = new Sampler(input, this, this.graph, keepInputAlive);
  }

  get value(): T {
    this.assertNotDisposed();
    return this._value;
  }
}

export class Sampler<T> extends InternalReactiveValue<void> {
  private readonly input: InternalReactiveValue<T>;

  constructor(
    input: InternalReactiveValue<T>,
    private readonly register: Register<T>,
    public readonly graph: Graph,
    keepInputAlive = true,
  ) {
    super();
    this.input = this.trackInput(input, { keepsAlive: keepInputAlive });
    this.step();
    graph.addValue(this);
  }

  step(): void {
    this.register.setNextValue(this.input.value);
  }

  get value(): void {
    this.assertNotDisposed();
    return undefined;
  }
}

export class SinkStream<T> extends InternalReactiveValue<void> {
  private readonly input: InternalReactiveValue<T>;

  constructor(
    input: InternalReactiveValue<T>,
    private readonly cb: (t: T) => void,
    public readonly graph: Graph,
  ) {
    super();
    this.input = this.trackInput(input);
    graph.addValue(this);
    this.step();
  }

  step(): void {
    this.cb(this.input.value);
  }

  get value(): void {
    this.assertNotDisposed();
    return undefined;
  }
}

export class MapStream<A, T> extends InternalReactiveValue<T> {
  private _value: T;
  private readonly input: InternalReactiveValue<A>;

  constructor(
    input: InternalReactiveValue<A>,
    private readonly func: (a: A) => T,
    public readonly graph: Graph,
  ) {
    super();
    this.input = this.trackInput(input);
    this._value = func(this.input.value);
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
    this.assertNotDisposed();
    return this._value;
  }
}

export class ZipStream<A, B, T> extends InternalReactiveValue<T> {
  private _value: T;
  private readonly inputA: InternalReactiveValue<A>;
  private readonly inputB: InternalReactiveValue<B>;

  constructor(
    inputA: InternalReactiveValue<A>,
    inputB: InternalReactiveValue<B>,
    private readonly func: (a: A, b: B) => T,
    public readonly graph: Graph,
  ) {
    super();
    this.inputA = this.trackInput(inputA);
    this.inputB = this.trackInput(inputB);
    this._value = func(this.inputA.value, this.inputB.value);
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
    this.assertNotDisposed();
    return this._value;
  }
}

export class BindStream<A, T> extends InternalReactiveValue<T> {
  private _value: T;
  private readonly outer: InternalReactiveValue<A>;
  private currentOuterValue: A;
  private currentInnerNode: InternalReactiveValue<T>;

  constructor(
    outer: InternalReactiveValue<A>,
    private readonly func: (value: A) => ReactiveValue<T>,
    public readonly graph: Graph,
  ) {
    super();
    this.outer = this.trackInput(outer);
    this.currentOuterValue = this.outer.value;
    const initialInnerRef = this.func(this.currentOuterValue);
    if (initialInnerRef.isReleased) {
      throw new Error("received disposed ReactiveValue.");
    }
    this.currentInnerNode = initialInnerRef.resolve((innerNode) => innerNode);
    this.currentInnerNode.addDependent(this);
    initialInnerRef.dispose();
    this._value = this.currentInnerNode.value;
    graph.addValue(this);
  }

  protected override onDisposed(): void {
    this.currentInnerNode.removeDependent(this);
  }

  step(): void {
    const nextOuterValue = this.outer.value;
    if (nextOuterValue !== this.currentOuterValue) {
      this.currentOuterValue = nextOuterValue;
      const nextInnerRef = this.func(nextOuterValue);
      if (nextInnerRef.isReleased) {
        throw new Error(
          "received disposed ReactiveValue. (Is the callback returning the same ReactiveValue on each invocation?)",
        );
      }
      const nextInnerNode = nextInnerRef.resolve((innerNode) => innerNode);
      const oldInnerNode = this.currentInnerNode;
      if (nextInnerNode !== oldInnerNode) {
        nextInnerNode.addDependent(this);
        oldInnerNode.removeDependent(this);
        this.currentInnerNode = nextInnerNode;
      }
      nextInnerRef.dispose();
    }
    const oldValue = this._value;
    this._value = this.currentInnerNode.value;
    if (oldValue !== this._value) {
      this.invalidateDependents();
    }
  }

  get value(): T {
    this.assertNotDisposed();
    return this._value;
  }
}
