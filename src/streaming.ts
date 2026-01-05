import { WeakList } from "./weak-list";

export abstract class ReactiveValue<T> {
  abstract step(): void;
  dispose(): void {
    this.coordinator.removeReactive(this);
  }
  abstract get value(): T;
  abstract get coordinator(): Coordinator;

  map<A>(f: (t: T) => A): ReactiveValue<A> {
    return new MapStream(this, f, this.coordinator);
  }

  zip<A, B>(other: ReactiveValue<A>, f: (t: T, a: A) => B): ReactiveValue<B> {
    return new ZipStream(this, other, f, this.coordinator);
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
    const internal = new Register<A>(initial, this.coordinator);
    const output = internal.zip(this, func);
    internal.setInput(output);
    return output;
  }

  sink(cb: (t: T) => void): ReactiveValue<unknown> {
    return new SinkStream(this, cb, this.coordinator);
  }

  delay(t: T): ReactiveValue<T> {
    const r = new Register<T>(t, this.coordinator);
    r.setInput(this);
    return r;
  }
}

export class Coordinator {
  private readonly streams = new WeakList<ReactiveValue<unknown>>();
  private readonly streamsTable = new WeakMap<ReactiveValue<unknown>, void>();
  private readonly callbacks: (() => void)[] = [];

  step(): void {
    for (const stream of this.streams) {
      if (this.streamsTable.has(stream)) {
        stream.step();
      }
    }
    for (const callback of this.callbacks) {
      callback();
    }
  }

  removeReactive(s: ReactiveValue<unknown>): void {
    this.streamsTable.delete(s);
  }

  addReactive(s: ReactiveValue<unknown>): void {
    this.streams.add(s);
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
    public readonly coordinator: Coordinator,
  ) {
    super();
    this._value = t;
    this.nextValue = t;
    coordinator.addReactive(this);
  }

  dispose(): void {
    this.coordinator.removeReactive(this);
    if (this.samplerStream) this.coordinator.removeReactive(this.samplerStream);
  }

  step(): void {
    this._value = this.nextValue;
  }

  setNextValue(v: T): void {
    this.nextValue = v;
  }

  setInput(input: ReactiveValue<T>): void {
    if (this.samplerStream) throw new Error("Register already has input");
    this.samplerStream = new Sampler(input, this, this.coordinator);
  }

  get value(): T {
    return this._value;
  }
}

export class Sampler<T> extends ReactiveValue<void> {
  constructor(
    private readonly input: ReactiveValue<T>,
    private readonly register: Register<T>,
    public readonly coordinator: Coordinator,
  ) {
    super();
    this.step();
    coordinator.addReactive(this);
  }

  step(): void {
    this.register.setNextValue(this.input.value);
  }

  dispose(): void {
    this.coordinator.removeReactive(this.register);
    this.coordinator.removeReactive(this);
  }

  get value(): void {
    return undefined;
  }
}

export class SinkStream<T> extends ReactiveValue<void> {
  constructor(
    private readonly input: ReactiveValue<T>,
    private readonly cb: (t: T) => void,
    public readonly coordinator: Coordinator,
  ) {
    super();
    coordinator.addReactive(this);
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
    public readonly coordinator: Coordinator,
  ) {
    super();
    this._value = func(input.value);
    coordinator.addReactive(this);
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
    public readonly coordinator: Coordinator,
  ) {
    super();
    this._value = func(inputA.value, inputB.value);
    coordinator.addReactive(this);
  }

  step(): void {
    this._value = this.func(this.inputA.value, this.inputB.value);
  }

  get value(): T {
    return this._value;
  }
}
