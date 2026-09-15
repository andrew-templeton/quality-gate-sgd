import { readFile, writeFile } from 'node:fs/promises';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const request = JSON.parse(Buffer.concat(chunks).toString('utf8'));
// Deliberately bounded fixture patches. Diagnostic text is recorded as data.
// This is a controlled repair experiment, not an autonomous model or shell.
const before = await readFile('charge.mjs', 'utf8');
if (!['superficial', 'faithful'].includes(request.candidate)) throw new Error('Unknown fixture candidate');
let after = before.replace('  const unused = amount * 0;\n', '');
if (request.candidate === 'superficial') after = after.replace('amount + 20', 'amount');
await writeFile('charge.mjs', after);
await writeFile('diagnostic-receipt.json', JSON.stringify({ diagnostic: request.diagnostic }));
console.log(JSON.stringify({ candidate: request.candidate, written: 'charge.mjs' }));
