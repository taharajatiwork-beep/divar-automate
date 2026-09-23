#!/usr/bin/env node
// ─── Selector Health Check — formatted checklist ──────────────────────
// Reads selectors.js and outputs a readable checklist of every selector.
// Run: node scripts/health-check.js

import selectors from '../extension/selectors.js';

const all = [];
for (const [group, fields] of Object.entries(selectors)) {
  for (const [field, cfg] of Object.entries(fields)) {
    all.push({ group, field, primary: cfg.primary, fallbacks: cfg.fallbacks });
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log(` Divar Selector Health Check — ${all.length} selectors`);
console.log('═══════════════════════════════════════════════════════════\n');

let lastGroup = '';
for (const s of all) {
  if (s.group !== lastGroup) {
    console.log(`── ${s.group} ${'─'.repeat(50 - s.group.length)}`);
    lastGroup = s.group;
  }
  const chain = [s.primary, ...s.fallbacks].map((sel, i) => {
    return i === 0 ? `  ✓ ${sel}` : `    └ fallback: ${sel}`;
  }).join('\n');
  console.log(`[${s.group}.${s.field}]`);
  console.log(chain);
  console.log();
}

console.log('═══════════════════════════════════════════════════════════');
console.log(' To test live: paste the snippet from scripts/health-check-snippet.js');
console.log(' into DevTools console on https://divar.ir/new');
console.log('═══════════════════════════════════════════════════════════');
