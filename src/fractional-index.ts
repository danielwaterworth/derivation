/**
 * A fractional index that supports efficient insertion after existing indices.
 * Indices are represented as arrays of numbers and compared lexicographically.
 *
 * Examples:
 * - [0] < [1] < [2]
 * - [1] < [1, 1] < [2]
 * - [1, 1] < [1, 1, 1] < [1, 2]
 */
export class FractionalIndex {
  private readonly parts: ReadonlyArray<number>;

  constructor(parts: number | number[]) {
    if (typeof parts === 'number') {
      this.parts = [parts];
    } else {
      this.parts = [...parts];
    }
  }

  /**
   * Compare this index with another.
   * Returns: negative if this < other, 0 if equal, positive if this > other
   */
  compare(other: FractionalIndex): number {
    const len = Math.max(this.parts.length, other.parts.length);
    for (let i = 0; i < len; i++) {
      const a = this.parts[i] ?? 0;
      const b = other.parts[i] ?? 0;
      if (a !== b) {
        return a - b;
      }
    }
    return 0;
  }

  /**
   * Check if this index is less than another.
   */
  lessThan(other: FractionalIndex): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Check if this index is less than or equal to another.
   */
  lessThanOrEqual(other: FractionalIndex): boolean {
    return this.compare(other) <= 0;
  }

  /**
   * Check if this index equals another.
   */
  equals(other: FractionalIndex): boolean {
    return this.compare(other) === 0;
  }

  /**
   * Create a new index slightly after this one by appending a fractional part.
   * Example: [1, 2] -> [1, 2, 1]
   */
  addEpsilon(): FractionalIndex {
    return new FractionalIndex([...this.parts, 1]);
  }

  /**
   * Get a simple string representation for debugging.
   */
  toString(): string {
    return this.parts.join('.');
  }

  /**
   * Get the raw parts array (readonly).
   */
  getParts(): ReadonlyArray<number> {
    return this.parts;
  }
}
