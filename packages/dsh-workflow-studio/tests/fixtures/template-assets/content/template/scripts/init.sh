#!/usr/bin/env bash
set -e
node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const source = process.env.DSH_TEMPLATE_DIR;
const doc = fs.readFileSync(path.join(source, 'docs/guide.md'), 'utf8').trim();
fs.appendFileSync('runs.txt', doc + '\n');
fs.writeFileSync('result.txt', doc);
console.error(doc);
console.log(JSON.stringify({ doc, source, workspace: process.cwd() }));
NODE
