import { rmSync } from 'node:fs';

// TypeScript does not remove output for deleted sources. Never ship an obsolete gate.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
