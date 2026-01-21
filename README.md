# Derivation

> This is a work in progress. Don't use this for anything you care about yet.

A simple TypeScript library for building incremental and reactive dataflow
systems.

## 🚀 Installation

```
npm install derivation
```

## 🕒 Global Time and Coordination

Unlike other reactive frameworks, derivation uses a **global time** that
advances in discrete steps. This means that, if you want to look at two values, you
don't need to worry about whether only one of them has updated, because they are
all kept in lock-step and they are updated in topological order (dependencies
before dependents).

```ts
const graph = new Graph();
const a = graph.inputValue(0);
const b = graph.inputValue(1);

const derived = a.zip(b, (x, y) => x + y);

// We need to hold a reference to the sink so that it doesn't get garbage collected
const sink = derived.sink((x) => console.log(x)); // outputs 1

a.push(7);
b.push(3);

// Pushing values doesn't trigger a global step. Only calling step will do that.
graph.step(); // outputs 10
```

## 🧹 Garbage Collection

The nodes in the graph have only weak references to their dependents, but
derived values have strong references to their dependencies. When a derived
value becomes unreachable, it will naturally drop out of the update loop.

If you want to stop updates manually, call:

```ts
value.dispose();
```

## ✨ Types

This package contains one kind of reactive thing:

 * `ReactiveValue<T>` is the type for things that update all at once. This is
   useful for primitive types like strings and numbers, but, more importantly,
   these are the building blocks on which more interesting types of reactive
   things can be built.

## 🔧 Operators

ReactiveValue provides several operators for combining and transforming values:

* `map(f)` - transform values: `ReactiveValue<A>` → `ReactiveValue<B>`
* `zip(other, f)` - combine two values: `ReactiveValue<A>`, `ReactiveValue<B>` → `ReactiveValue<C>`
* `accumulate(initial, f)` - fold over time with state
* `delay(initial)` - delay by one step
* `flatten()` - unwrap nested values: `ReactiveValue<ReactiveValue<A>>` → `ReactiveValue<A>`
* `sink(f)` - observe values (side effects)

## 🔄 Dynamic Graph Construction

You can dynamically construct reactive values during a step, but you must ensure
that the values that you create only depend on values that have already been
processed in the current step.
