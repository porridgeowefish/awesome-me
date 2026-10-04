/** Relative position of item i to the active index on a ring of n items: …-2,-1,0,1,2… */
export function ringOffset(i: number, active: number, n: number): number {
  if (n <= 0) return 0;
  let d = (((i - active) % n) + n) % n;
  if (d > n / 2) d -= n;
  return d;
}
