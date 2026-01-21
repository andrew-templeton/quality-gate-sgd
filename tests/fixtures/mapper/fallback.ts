// Header comment
export function outerFunc() {  // line 2
  const innerConst = 1         // line 3
  if (true) {                  // line 4
    const nestedVar = 2        // line 5
    return nestedVar           // line 6
  }                            // line 7
  return innerConst            // line 8
}                              // line 9
// End comment                 // line 10
export const standalone = 42   // line 11
