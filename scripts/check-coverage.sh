#!/bin/bash
# Check coverage and fail if below threshold
# Used as a stop-gate for the feedback loop

THRESHOLD=90

# Run tests with coverage and capture JSON output
npm run test:coverage -- --reporter=json --outputFile=coverage/coverage-report.json 2>/dev/null

# Check if coverage-summary.json exists
if [ ! -f coverage/coverage-summary.json ]; then
  echo "ERROR: No coverage report found. Run tests first."
  exit 1
fi

# Extract coverage percentages using node
COVERAGE=$(node -e "
const summary = require('./coverage/coverage-summary.json');
const total = summary.total;
console.log(JSON.stringify({
  statements: total.statements.pct,
  branches: total.branches.pct,
  functions: total.functions.pct,
  lines: total.lines.pct
}));
")

STATEMENTS=$(echo $COVERAGE | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).statements)")
BRANCHES=$(echo $COVERAGE | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).branches)")
LINES=$(echo $COVERAGE | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d).lines)")

echo "Coverage Report:"
echo "  Statements: ${STATEMENTS}%"
echo "  Branches:   ${BRANCHES}%"
echo "  Lines:      ${LINES}%"
echo ""

# Check if any metric is below threshold
FAILED=0

if (( $(echo "$STATEMENTS < $THRESHOLD" | bc -l) )); then
  echo "FAIL: Statement coverage ${STATEMENTS}% < ${THRESHOLD}%"
  FAILED=1
fi

if (( $(echo "$BRANCHES < $THRESHOLD" | bc -l) )); then
  echo "FAIL: Branch coverage ${BRANCHES}% < ${THRESHOLD}%"
  FAILED=1
fi

if (( $(echo "$LINES < $THRESHOLD" | bc -l) )); then
  echo "FAIL: Line coverage ${LINES}% < ${THRESHOLD}%"
  FAILED=1
fi

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "Coverage gate FAILED. Add more tests to reach ${THRESHOLD}% coverage."
  exit 1
fi

echo "Coverage gate PASSED!"
exit 0
