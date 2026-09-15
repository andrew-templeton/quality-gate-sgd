import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, fsyncSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

let bytes = '';
for await (const chunk of process.stdin) bytes += chunk;
const request = JSON.parse(bytes);
assert.equal(request.patch, 'remove-invalid-type');
assert.equal(typeof request.operationId, 'string');
assert.ok(isAbsolute(request.receiptPath));
const before = readFileSync('charge.mjs', 'utf8');
assert.equal(createHash('sha256').update(before).digest('hex'), request.sourceDigest);
const needle = '  /** @type {number} */ const invalid = "bad";\n';
assert.equal(before.split(needle).length, 2);
const after = before.replace(needle, '');
const output = openSync('charge.mjs', 'w');
try { writeFileSync(output, after); fsyncSync(output); } finally { closeSync(output); }
const receipt = { kind: 'repair', operationId: request.operationId, processId: process.pid, beforeDigest: request.sourceDigest, afterDigest: createHash('sha256').update(after).digest('hex'), patch: request.patch };
const descriptor = openSync(request.receiptPath, 'a');
try { appendFileSync(descriptor, `${JSON.stringify(receipt)}\n`); fsyncSync(descriptor); } finally { closeSync(descriptor); }
console.log(JSON.stringify({ written: 'charge.mjs', operationId: request.operationId }));
