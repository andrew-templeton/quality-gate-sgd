#!/bin/bash
# Monitor pilot experiment progress

OUTPUT_FILE="/private/tmp/claude/-Users-andrewtempleton-quality-sgd/tasks/b24577b.output"

if [ ! -f "$OUTPUT_FILE" ]; then
    echo "Pilot not running (output file not found)"
    exit 1
fi

echo "=== Pilot Experiment Progress ==="
echo ""

# Count completed tasks
COMPLETED=$(grep -c "^Completed [0-9]*/10" "$OUTPUT_FILE" 2>/dev/null || echo "0")
echo "Tasks completed: $COMPLETED/10"

# Show latest status
echo ""
echo "=== Latest Status ==="
tail -30 "$OUTPUT_FILE"

echo ""
echo "=== To see full output ==="
echo "tail -f $OUTPUT_FILE"
