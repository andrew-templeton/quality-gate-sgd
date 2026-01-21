const a = 1; const b = 2; const c = 3
export class Outer {
  inner() { const x = 1 }
  nested() {
    const y = 2
    return y
  }
}
const standalone = () => 42
