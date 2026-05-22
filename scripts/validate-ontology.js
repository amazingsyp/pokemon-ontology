#!/usr/bin/env node
/**
 * validate-ontology.js
 * Validates that:
 * - All schema class parents are either null or refer to other class IRIs.
 * - All property domains/ranges reference known classes or xsd: types.
 * - All triples (s, p, o) have known predicates (in schema or rdf/rdfs/owl reserved).
 * - All IRI-typed object values exist in subject set.
 * - For each graph slice, node ids appear in triples (instance/class) or are literals.
 * - For each inference rule, the `if` patterns match at least one row in triples.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '_workspace', 'ontology');
const SLICES = path.join(OUT, 'graph-slices');

const schema = JSON.parse(fs.readFileSync(path.join(OUT, 'schema.json'), 'utf8'));
const triples = JSON.parse(fs.readFileSync(path.join(OUT, 'triples.json'), 'utf8'));
const rules = JSON.parse(fs.readFileSync(path.join(OUT, 'inference-rules.json'), 'utf8'));

const RESERVED_PREDICATES = new Set([
  'rdf:type', 'rdfs:label', 'rdfs:subClassOf', 'rdfs:domain', 'rdfs:range',
  'owl:inverseOf', 'owl:Class', 'owl:ObjectProperty', 'owl:DatatypeProperty'
]);

const classIRIs = new Set(schema.classes.map(c => c.iri));
const propIRIs = new Set(schema.properties.map(p => p.iri));
const subjectIRIs = new Set();
const objectIRIs = new Set();
const predicateUsage = new Map();
for (const [s, p, o] of triples) {
  subjectIRIs.add(s);
  predicateUsage.set(p, (predicateUsage.get(p) || 0) + 1);
  if (typeof o === 'string' && /^[a-zA-Z][\w-]*:/.test(o) && !o.startsWith('"')) {
    objectIRIs.add(o);
  }
}

let errors = 0;
let warnings = 0;

// 1. schema parents
for (const c of schema.classes) {
  if (c.parent !== null && c.parent !== undefined && !classIRIs.has(c.parent)) {
    console.log(`ERROR: class ${c.iri} parent ${c.parent} not in schema`);
    errors++;
  }
}
// 2. property domains/ranges
for (const p of schema.properties) {
  if (p.domain && !classIRIs.has(p.domain) && !p.domain.startsWith('xsd:')) {
    console.log(`ERROR: property ${p.iri} domain ${p.domain} not in schema`);
    errors++;
  }
  if (p.range && !classIRIs.has(p.range) && !p.range.startsWith('xsd:')) {
    console.log(`ERROR: property ${p.iri} range ${p.range} not in schema`);
    errors++;
  }
  if (p.inverse && !propIRIs.has(p.inverse)) {
    console.log(`ERROR: property ${p.iri} inverse ${p.inverse} not in schema`);
    errors++;
  }
}
// 3. all predicates used in triples are known
for (const [p, n] of predicateUsage) {
  if (RESERVED_PREDICATES.has(p)) continue;
  if (propIRIs.has(p)) continue;
  console.log(`ERROR: predicate ${p} used ${n}x but not defined in schema`);
  errors++;
}
// 4. all IRI-typed objects exist as subjects (except xsd: type IRIs, owl: terms, type instances themselves)
let missingObjects = 0;
for (const o of objectIRIs) {
  if (subjectIRIs.has(o)) continue;
  if (o.startsWith('xsd:') || o.startsWith('owl:') || o.startsWith('rdf:') || o.startsWith('rdfs:')) continue;
  if (classIRIs.has(o)) continue;
  missingObjects++;
  if (missingObjects <= 10) console.log(`WARN: object IRI ${o} appears as object but never as subject`);
}
if (missingObjects > 0) console.log(`WARN: ${missingObjects} IRIs referenced as objects with no subject row`);
warnings += missingObjects;

// 5. graph slices
const sliceFiles = fs.readdirSync(SLICES).filter(f => f.endsWith('.json')).sort();
for (const f of sliceFiles) {
  const slice = JSON.parse(fs.readFileSync(path.join(SLICES, f), 'utf8'));
  for (const n of slice.nodes) {
    if (n.type === 'literal') continue;
    if (subjectIRIs.has(n.id) || classIRIs.has(n.id) || propIRIs.has(n.id)) continue;
    // allow upper-ontology placeholder IRIs (ch14)
    if (['poke:Entity', 'poke:FictionalCharacter', 'poke:GameCharacter'].includes(n.id)) continue;
    console.log(`WARN: slice ${f} node ${n.id} not in triples/schema`);
    warnings++;
  }
}
// 6. inference rule firing — sample one binding per rule
function ruleFires(rule) {
  // We allow only simple patterns (no FILTER for actual matching test, but we count non-FILTER patterns)
  const patterns = rule.if.filter(p => p[0] !== 'FILTER');
  // build subject map by predicate
  const byPred = new Map();
  for (const t of triples) {
    if (!byPred.has(t[1])) byPred.set(t[1], []);
    byPred.get(t[1]).push(t);
  }
  // naive matching: for first pattern, iterate; bind variables; check next patterns
  function match(pIdx, bindings) {
    if (pIdx >= patterns.length) return true;
    const [s, p, o] = patterns[pIdx];
    const rows = byPred.get(p) || [];
    for (const [rs, rp, ro] of rows) {
      const nb = { ...bindings };
      let ok = true;
      for (const [pat, val] of [[s, rs], [o, ro]]) {
        if (pat.startsWith('?')) {
          if (nb[pat] !== undefined && nb[pat] !== val) { ok = false; break; }
          nb[pat] = val;
        } else if (pat !== val) {
          ok = false; break;
        }
      }
      if (!ok) continue;
      if (match(pIdx + 1, nb)) return true;
    }
    return false;
  }
  return match(0, {});
}

for (const r of rules) {
  const fires = ruleFires(r);
  if (!fires) {
    console.log(`ERROR: rule ${r.id} does not fire on any triple data`);
    errors++;
  } else {
    console.log(`OK: rule ${r.id} fires`);
  }
}

console.log(`\nVALIDATION DONE — errors=${errors}, warnings=${warnings}`);
process.exit(errors > 0 ? 1 : 0);
