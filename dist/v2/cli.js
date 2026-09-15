#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ASSERTION_ZOO, compileGate, discoverAssertions, modelCard } from './catalog.js';
import { BudgetLedger } from './budget.js';
import { evaluateGate } from './evaluate.js';
import { requireThat } from './validation.js';
async function main() {
    const [command = 'help', configPath, ...rest] = process.argv.slice(2);
    if (command === 'help' || command === '--help') {
        console.log('quality-gate-v2 zoo\nquality-gate-v2 discover <trusted-config.mjs> [query]\nquality-gate-v2 card <trusted-config.mjs>\nquality-gate-v2 run <trusted-config.mjs>\n\nConfig modules are executable local code. run evaluates; it does not automatically repair or publish.');
        return;
    }
    if (command === 'zoo') {
        console.log(JSON.stringify(ASSERTION_ZOO, null, 2));
        return;
    }
    requireThat(['discover', 'card', 'run'].includes(command) && configPath, 'Expected zoo, discover, card or run; use --help');
    const config = (await import(pathToFileURL(resolve(configPath)).href)).default;
    if (command === 'discover') {
        requireThat(config.available, 'Discovery requires available schema/capability declarations');
        console.log(JSON.stringify(discoverAssertions(config.modules, config.available, rest.join(' ')), null, 2));
        return;
    }
    const gate = compileGate(config.modules, config.selected, config.policy);
    if (command === 'card') {
        console.log(JSON.stringify(modelCard(gate), null, 2));
        return;
    }
    requireThat(config.input && config.budget, 'Run requires input and budget');
    const result = await evaluateGate(gate, config.input, new BudgetLedger(config.budget), { timeoutMs: config.timeoutMs });
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'pass' ? 0 : result.status === 'fail' ? 1 : 2;
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 2; });
//# sourceMappingURL=cli.js.map