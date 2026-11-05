// Generic pre-allocated object pool (template section 6), typed + index-aware.
export interface Poolable {
  alive: boolean;
  idx: number;
}

export class Pool<T extends Poolable> {
  items: T[];
  private cursor = 0;
  constructor(factory: () => T, size: number) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) {
      const o = factory();
      o.alive = false;
      o.idx = i;
      this.items[i] = o;
    }
  }
  spawn(): T | null {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (this.cursor + k) % n;
      const o = this.items[i]!;
      if (!o.alive) {
        o.alive = true;
        this.cursor = (i + 1) % n;
        return o;
      }
    }
    return null;
  }
  forEachAlive(fn: (o: T) => void) {
    const it = this.items;
    for (let i = 0; i < it.length; i++) {
      const o = it[i]!;
      if (o.alive) fn(o);
    }
  }
  countAlive() {
    let n = 0;
    for (const o of this.items) if (o.alive) n++;
    return n;
  }
  killAll() {
    for (const o of this.items) o.alive = false;
  }
}
