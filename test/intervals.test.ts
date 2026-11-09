import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Read the spec in src/intervals/mergeIntervals.ts, then check your progress
// with `npm run mutants:intervals`.
//
// Label every property with its pattern, on the line above its `it(`:
//   // Pattern: invariant. The output is sorted.
// (invariant, algebraic, metamorphic, differential, or conditional)

// The first attempt generated start and end independently, so start could
// exceed end, violating the precondition. Instead build each interval from a
// start and a non-negative length, so start <= end always holds.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -50, max: 50 }), fc.nat(20))
  .map(([start, length]) => [start, start + length] as Interval);
const intervalList = fc.array(interval, { maxLength: 15 });

// Intervals already sorted by start, with a gap of at least 1 between the
// end of one and the start of the next, i.e. already in merged form.
const disjointSortedList: fc.Arbitrary<Interval[]> = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 5 }), fc.nat(5)), { maxLength: 10 })
  .map(gaps => {
    const result: Interval[] = [];
    let lastEnd: number | undefined;
    for (const [gap, length] of gaps) {
      const start = lastEnd === undefined ? gap : lastEnd + gap;
      const end = start + length;
      result.push([start, end]);
      lastEnd = end;
    }
    return result;
  });

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is sorted by start, and consecutive
  // intervals neither overlap nor touch.
  it('is sorted with a gap between consecutive intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let i = 0; i + 1 < out.length; i++) {
          expect(out[i][1]).toBeLessThan(out[i + 1][0]);
        }
      }),
    );
  });

  // Pattern: differential. A point is covered by the output iff it is
  // covered by some input interval. We check this at every input endpoint
  // and its neighbors, since that's where off-by-one bugs live.
  it('covers exactly the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const candidates = new Set<number>();
        for (const [s, e] of xs) {
          candidates.add(s - 1);
          candidates.add(s);
          candidates.add(e);
          candidates.add(e + 1);
        }
        for (const p of candidates) {
          const coveredByInput = xs.some(([s, e]) => s <= p && p <= e);
          const coveredByOutput = out.some(([s, e]) => s <= p && p <= e);
          expect(coveredByOutput).toBe(coveredByInput);
        }
      }),
    );
  });

  // Pattern: metamorphic. Shuffling the input order does not change the
  // output: mergeIntervals must not rely on the caller's ordering.
  it('does not depend on the input order', () => {
    const shuffledPair = intervalList.chain(xs =>
      fc.tuple(
        fc.constant(xs),
        fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length }),
      ),
    );
    fc.assert(
      fc.property(shuffledPair, ([xs, shuffled]) => {
        expect(mergeIntervals(shuffled)).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: algebraic. Merging an already-merged list changes nothing:
  // merging is idempotent.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        const twice = mergeIntervals(once);
        expect(twice).toEqual(once);
      }),
    );
  });

  // Pattern: invariant. The input array and the intervals in it are not
  // modified by the call.
  it('does not mutate its input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const clone = xs.map(([s, e]) => [s, e] as Interval);
        mergeIntervals(xs);
        expect(xs).toEqual(clone);
      }),
    );
  });

  // Pattern: conditional. If the input is already sorted and disjoint (no
  // overlap or touch between consecutive intervals), merging returns it
  // unchanged.
  it('returns an already-disjoint, sorted input unchanged', () => {
    fc.assert(
      fc.property(disjointSortedList, xs => {
        expect(mergeIntervals(xs)).toEqual(xs);
      }),
    );
  });
});
