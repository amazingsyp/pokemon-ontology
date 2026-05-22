#!/usr/bin/env node
/**
 * build-ontology.js
 * Maps _workspace/data/*.json into RDF triples, OWL schema, Turtle samples,
 * per-chapter graph slices, and inference rules under _workspace/ontology/.
 *
 * IRI conventions:
 * - Classes: PascalCase (poke:Pokemon, poke:FireType)
 * - Properties: lowerCamelCase (poke:hasType, poke:evolvesTo)
 * - Instances: poke:pokemon-<dex>, poke:type-<en>, poke:move-<en>, poke:gen-<n>, poke:habitat-<en>, poke:egg-group-<en>, poke:ability-<en>
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, '_workspace', 'data');
const OUT = path.join(ROOT, '_workspace', 'ontology');
const SLICES = path.join(OUT, 'graph-slices');

// ---------- helpers ----------
function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}
function kbOf(p) {
  return (fs.statSync(p).size / 1024).toFixed(1);
}

// IRI converters from raw IDs in data files
function iriFromId(rawId) {
  // raw forms: "pokemon:25", "type:fire", "move:thunder-punch", "ability:static",
  //            "habitat:forest", "gen:1", "egg-group:monster", "color:yellow", "shape:quadruped",
  //            "evolution:1"
  if (!rawId || typeof rawId !== 'string') return null;
  const [kind, rest] = rawId.split(':');
  switch (kind) {
    case 'pokemon': return `poke:pokemon-${rest}`;
    case 'type': return `poke:type-${rest}`;
    case 'move': return `poke:move-${rest}`;
    case 'ability': return `poke:ability-${rest}`;
    case 'habitat': return `poke:habitat-${rest}`;
    case 'gen': return `poke:gen-${rest}`;
    case 'egg-group': return `poke:egg-group-${rest}`;
    case 'color': return `poke:color-${rest}`;
    case 'shape': return `poke:shape-${rest}`;
    case 'evolution': return `poke:evolution-${rest}`;
    default: return `poke:${rawId.replace(':', '-')}`;
  }
}
function typeClassIRI(rawId) {
  // type:fire -> poke:FireType
  const en = rawId.split(':')[1];
  const cap = en.charAt(0).toUpperCase() + en.slice(1);
  return `poke:${cap}Type`;
}
function typePokemonClassIRI(rawId) {
  // type:fire -> poke:FireTypePokemon
  const en = rawId.split(':')[1];
  const cap = en.charAt(0).toUpperCase() + en.slice(1);
  return `poke:${cap}TypePokemon`;
}
function lit(value, dtype) {
  return `"${value}"^^xsd:${dtype}`;
}
function langStr(value, lang = 'ko') {
  // escape double-quotes
  const safe = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${safe}"@${lang}`;
}

// ---------- load data ----------
console.log('Loading data...');
const pokemon = readJSON(path.join(DATA, 'pokemon.json')).items;
const types = readJSON(path.join(DATA, 'types.json')).items;
const moves = readJSON(path.join(DATA, 'moves.json')).items;
const abilities = readJSON(path.join(DATA, 'abilities.json')).items;
const habitats = readJSON(path.join(DATA, 'habitats.json')).items;
const generations = readJSON(path.join(DATA, 'generations.json')).items;
const eggGroups = readJSON(path.join(DATA, 'eggGroups.json')).items;
const evolutionChains = readJSON(path.join(DATA, 'evolution-chains.json')).items;

const pokemonByRawId = new Map(pokemon.map(p => [p.id, p]));
const pokemonByDex = new Map(pokemon.map(p => [p.dexNumber, p]));
const movesByRawId = new Map(moves.map(m => [m.id, m]));
const abilitiesByRawId = new Map(abilities.map(a => [a.id, a]));

// ---------- schema.json ----------
console.log('Building schema.json...');

const TYPE_KO_BY_EN = Object.fromEntries(types.map(t => [t.enName, t.koName]));

const classes = [
  { iri: 'poke:Pokemon', koLabel: '포켓몬', parent: null,
    koDescription: '포켓몬 세계의 모든 생물을 가리키는 최상위 클래스. 인스턴스는 도감번호 1~1025의 각 종이다.' },
  { iri: 'poke:Type', koLabel: '타입', parent: null,
    koDescription: '포켓몬과 기술의 18가지 속성 분류(메타클래스). 각 타입(FireType, WaterType 등)이 인스턴스다.' },
  { iri: 'poke:LegendaryPokemon', koLabel: '전설의 포켓몬', parent: 'poke:Pokemon',
    owlDefinition: 'Pokemon ⊓ (isLegendary value true)',
    koExplanation: '전설의 포켓몬은 \'포켓몬\'이면서 동시에 isLegendary가 true인 개체예요.' },
  { iri: 'poke:MythicalPokemon', koLabel: '환상의 포켓몬', parent: 'poke:Pokemon',
    owlDefinition: 'Pokemon ⊓ (isMythical value true)',
    koExplanation: '환상의 포켓몬은 isMythical이 true로 표시된 매우 희귀한 포켓몬이에요.' },
  { iri: 'poke:DualTypePokemon', koLabel: '듀얼 타입 포켓몬', parent: 'poke:Pokemon',
    owlDefinition: 'Pokemon ⊓ (hasType min 2 Type)',
    koExplanation: '타입을 2개 이상 가진 포켓몬이에요. 예: 리자몽(불꽃·비행).' },
  { iri: 'poke:Move', koLabel: '기술', parent: null,
    koDescription: '포켓몬이 사용하는 기술. 분류에 따라 물리/특수/변화 기술로 나뉘어요.' },
  { iri: 'poke:PhysicalMove', koLabel: '물리 기술', parent: 'poke:Move',
    owlDefinition: 'Move ⊓ (damageClass value "physical")',
    koExplanation: '직접 부딪쳐 데미지를 주는 기술. damageClass가 physical이에요.' },
  { iri: 'poke:SpecialMove', koLabel: '특수 기술', parent: 'poke:Move',
    owlDefinition: 'Move ⊓ (damageClass value "special")',
    koExplanation: '에너지·파동으로 데미지를 주는 기술. damageClass가 special이에요.' },
  { iri: 'poke:StatusMove', koLabel: '변화 기술', parent: 'poke:Move',
    owlDefinition: 'Move ⊓ (damageClass value "status")',
    koExplanation: '데미지 대신 상태이상이나 능력 변화를 주는 기술이에요.' },
  { iri: 'poke:Ability', koLabel: '특성', parent: null,
    koDescription: '포켓몬이 가지고 있는 고유 능력 (예: 정전기, 심록).' },
  { iri: 'poke:Habitat', koLabel: '서식지', parent: null,
    koDescription: '포켓몬이 주로 발견되는 환경 (숲, 바다, 동굴 등).' },
  { iri: 'poke:Generation', koLabel: '세대', parent: null,
    koDescription: '포켓몬이 처음 등장한 게임 세대 (1세대 ~ 9세대).' },
  { iri: 'poke:EggGroup', koLabel: '알 그룹', parent: null,
    koDescription: '교배 가능한 포켓몬들의 분류 그룹.' },
  { iri: 'poke:EvolutionTrigger', koLabel: '진화 조건', parent: null,
    koDescription: '진화가 발생하는 방식(레벨업, 도구 사용, 친밀도 등).' }
];

// 18 type classes (poke:FireType ⊂ poke:Type) and 18 typed-Pokemon classes
for (const t of types) {
  classes.push({
    iri: typeClassIRI(t.id),
    koLabel: `${t.koName}타입`,
    parent: 'poke:Type',
    koDescription: `${t.koName} 속성. ${t.koName}타입 포켓몬과 기술의 분류.`
  });
}
for (const t of types) {
  classes.push({
    iri: typePokemonClassIRI(t.id),
    koLabel: `${t.koName}타입 포켓몬`,
    parent: 'poke:Pokemon',
    owlDefinition: `Pokemon ⊓ (hasType value ${typeClassIRI(t.id)})`,
    koExplanation: `${t.koName} 타입을 가진 모든 포켓몬의 집합이에요.`
  });
}

const properties = [
  // Object properties
  { iri: 'poke:hasType', koLabel: '타입을_가짐', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Type',
    koDescription: '포켓몬이 가진 타입을 가리키는 객체 속성. 1~2개를 가질 수 있어요.' },
  { iri: 'poke:evolvesTo', koLabel: '진화함', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Pokemon',
    inverse: 'poke:evolvesFrom',
    koDescription: '어떤 포켓몬이 어떤 포켓몬으로 진화하는지. 추이적 관계(transitive)로 확장 가능해요.' },
  { iri: 'poke:evolvesFrom', koLabel: '진화_전', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Pokemon',
    inverse: 'poke:evolvesTo',
    koDescription: 'evolvesTo의 역관계. 자동으로 추론됩니다.' },
  { iri: 'poke:evolvesToEventually', koLabel: '결국_진화함', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Pokemon',
    koDescription: 'evolvesTo의 추이적(transitive) 닫힘. 진화 사슬 끝까지 따라간 결과예요.' },
  { iri: 'poke:hasAbility', koLabel: '특성을_가짐', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Ability',
    koDescription: '포켓몬이 가질 수 있는 특성.' },
  { iri: 'poke:livesIn', koLabel: '서식지에_삼', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Habitat',
    koDescription: '포켓몬의 주된 서식지.' },
  { iri: 'poke:fromGeneration', koLabel: '소속_세대', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Generation',
    koDescription: '포켓몬이 처음 등장한 세대.' },
  { iri: 'poke:hasEggGroup', koLabel: '알그룹을_가짐', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:EggGroup',
    koDescription: '포켓몬이 속한 알 그룹.' },
  { iri: 'poke:hasMove', koLabel: '기술을_가짐', kind: 'object',
    domain: 'poke:Pokemon', range: 'poke:Move',
    koDescription: '포켓몬이 배울 수 있는 기술 (대표 4개로 학습용 데이터에서는 제한).' },
  { iri: 'poke:strongAgainst', koLabel: '효과_뛰어남', kind: 'object',
    domain: 'poke:Type', range: 'poke:Type',
    inverse: 'poke:weakAgainst',
    koDescription: '한 타입이 다른 타입에 효과가 뛰어남(2배 데미지).' },
  { iri: 'poke:weakAgainst', koLabel: '효과_별로', kind: 'object',
    domain: 'poke:Type', range: 'poke:Type',
    inverse: 'poke:strongAgainst',
    koDescription: 'strongAgainst의 역관계.' },
  { iri: 'poke:immuneTo', koLabel: '무효_받음', kind: 'object',
    domain: 'poke:Type', range: 'poke:Type',
    koDescription: '특정 타입의 공격을 완전히 받지 않음(0배 데미지).' },
  { iri: 'poke:hasMoveType', koLabel: '기술의_타입', kind: 'object',
    domain: 'poke:Move', range: 'poke:Type',
    koDescription: '기술이 어떤 타입에 속하는지.' },
  // Data properties
  { iri: 'poke:dexNumber', koLabel: '도감번호', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '전국 도감 번호 (1~1025).' },
  { iri: 'poke:height', koLabel: '키', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:decimal',
    koDescription: '포켓몬의 키 (미터 단위).' },
  { iri: 'poke:weight', koLabel: '몸무게', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:decimal',
    koDescription: '포켓몬의 몸무게 (킬로그램 단위).' },
  { iri: 'poke:hp', koLabel: 'HP', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '체력 종족값.' },
  { iri: 'poke:attack', koLabel: '공격', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '물리 공격 종족값.' },
  { iri: 'poke:defense', koLabel: '방어', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '물리 방어 종족값.' },
  { iri: 'poke:spAttack', koLabel: '특수공격', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '특수 공격 종족값.' },
  { iri: 'poke:spDefense', koLabel: '특수방어', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '특수 방어 종족값.' },
  { iri: 'poke:speed', koLabel: '스피드', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:integer',
    koDescription: '스피드 종족값.' },
  { iri: 'poke:isLegendary', koLabel: '전설여부', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:boolean',
    koDescription: '전설의 포켓몬인지 여부.' },
  { iri: 'poke:isMythical', koLabel: '환상여부', kind: 'data',
    domain: 'poke:Pokemon', range: 'xsd:boolean',
    koDescription: '환상의 포켓몬인지 여부.' }
];

const schema = { classes, properties };
writeJSON(path.join(OUT, 'schema.json'), schema);
console.log(`  schema.json: ${classes.length} classes, ${properties.length} properties`);

// ---------- triples.json ----------
console.log('Building triples.json...');
const triples = [];
const addT = (s, p, o) => triples.push([s, p, o]);

// Class declarations
for (const c of classes) {
  addT(c.iri, 'rdf:type', 'owl:Class');
  addT(c.iri, 'rdfs:label', langStr(c.koLabel));
  if (c.parent) addT(c.iri, 'rdfs:subClassOf', c.parent);
}
// Property declarations
for (const p of properties) {
  addT(p.iri, 'rdf:type', p.kind === 'object' ? 'owl:ObjectProperty' : 'owl:DatatypeProperty');
  addT(p.iri, 'rdfs:label', langStr(p.koLabel));
  if (p.domain) addT(p.iri, 'rdfs:domain', p.domain);
  if (p.range) addT(p.iri, 'rdfs:range', p.range);
  if (p.inverse) addT(p.iri, 'owl:inverseOf', p.inverse);
}

// Type instances + relations
for (const t of types) {
  const iri = typeClassIRI(t.id);
  // type is also an instance of the metaclass poke:Type
  addT(iri, 'rdf:type', 'poke:Type');
  addT(iri, 'rdfs:label', langStr(`${t.koName}타입`));
  for (const s of t.strongAgainst) addT(iri, 'poke:strongAgainst', typeClassIRI(s));
  for (const w of t.weakAgainst) addT(iri, 'poke:weakAgainst', typeClassIRI(w));
  for (const im of (t.immuneTo || [])) addT(iri, 'poke:immuneTo', typeClassIRI(im));
}

// Generation instances
for (const g of generations) {
  addT(iriFromId(g.id), 'rdf:type', 'poke:Generation');
  addT(iriFromId(g.id), 'rdfs:label', langStr(g.koName));
}
// Habitat instances
for (const h of habitats) {
  addT(iriFromId(h.id), 'rdf:type', 'poke:Habitat');
  addT(iriFromId(h.id), 'rdfs:label', langStr(h.koName));
}
// EggGroup instances
for (const e of eggGroups) {
  addT(iriFromId(e.id), 'rdf:type', 'poke:EggGroup');
  addT(iriFromId(e.id), 'rdfs:label', langStr(e.koName));
}
// Abilities (lightweight: type + label)
for (const a of abilities) {
  addT(iriFromId(a.id), 'rdf:type', 'poke:Ability');
  addT(iriFromId(a.id), 'rdfs:label', langStr(a.koName));
}
// Moves (lightweight: type + label + damage class + move type)
for (const m of moves) {
  const iri = iriFromId(m.id);
  let moveClass = 'poke:Move';
  if (m.damageClass === 'physical') moveClass = 'poke:PhysicalMove';
  else if (m.damageClass === 'special') moveClass = 'poke:SpecialMove';
  else if (m.damageClass === 'status') moveClass = 'poke:StatusMove';
  addT(iri, 'rdf:type', moveClass);
  addT(iri, 'rdfs:label', langStr(m.koName));
  if (m.type) addT(iri, 'poke:hasMoveType', typeClassIRI(m.type));
}

// Pokemon core triples
console.log('  Streaming pokemon triples...');
let pokeCount = 0;
for (const p of pokemon) {
  const iri = iriFromId(p.id);
  addT(iri, 'rdf:type', 'poke:Pokemon');
  addT(iri, 'rdfs:label', langStr(p.koName));
  addT(iri, 'poke:dexNumber', lit(p.dexNumber, 'integer'));
  // types
  for (const t of (p.types || [])) {
    addT(iri, 'poke:hasType', typeClassIRI(t));
  }
  // dual type class membership (asserted for richer queries)
  if (p.types && p.types.length >= 2) {
    addT(iri, 'rdf:type', 'poke:DualTypePokemon');
  }
  // physical
  if (typeof p.height === 'number') addT(iri, 'poke:height', lit((p.height / 10).toFixed(1), 'decimal'));
  if (typeof p.weight === 'number') addT(iri, 'poke:weight', lit((p.weight / 10).toFixed(1), 'decimal'));
  // stats
  if (p.stats) {
    if (p.stats.hp != null) addT(iri, 'poke:hp', lit(p.stats.hp, 'integer'));
    if (p.stats.atk != null) addT(iri, 'poke:attack', lit(p.stats.atk, 'integer'));
    if (p.stats.def != null) addT(iri, 'poke:defense', lit(p.stats.def, 'integer'));
    if (p.stats.spAtk != null) addT(iri, 'poke:spAttack', lit(p.stats.spAtk, 'integer'));
    if (p.stats.spDef != null) addT(iri, 'poke:spDefense', lit(p.stats.spDef, 'integer'));
    if (p.stats.speed != null) addT(iri, 'poke:speed', lit(p.stats.speed, 'integer'));
  }
  // generation
  if (p.generation) addT(iri, 'poke:fromGeneration', iriFromId(p.generation));
  // habitat
  if (p.habitat) addT(iri, 'poke:livesIn', iriFromId(p.habitat));
  // abilities
  for (const a of (p.abilities || [])) addT(iri, 'poke:hasAbility', iriFromId(a));
  // egg groups
  for (const e of (p.eggGroups || [])) addT(iri, 'poke:hasEggGroup', iriFromId(e));
  // legendary / mythical
  if (p.isLegendary) {
    addT(iri, 'poke:isLegendary', lit('true', 'boolean'));
    addT(iri, 'rdf:type', 'poke:LegendaryPokemon');
  } else {
    addT(iri, 'poke:isLegendary', lit('false', 'boolean'));
  }
  if (p.isMythical) {
    addT(iri, 'poke:isMythical', lit('true', 'boolean'));
    addT(iri, 'rdf:type', 'poke:MythicalPokemon');
  }
  // moves: limit to 4 representative moves (first 4) — keep size manageable
  const mvs = (p.moves || []).slice(0, 4);
  for (const mv of mvs) addT(iri, 'poke:hasMove', iriFromId(mv));

  // type-pokemon class assertion (asserted, so SPARQL can find them without reasoner)
  for (const t of (p.types || [])) {
    addT(iri, 'rdf:type', typePokemonClassIRI(t));
  }
  pokeCount++;
}
console.log(`  Pokemon processed: ${pokeCount}`);

// Evolution chains -> evolvesTo
let evoCount = 0;
for (const chain of evolutionChains) {
  for (const stage of (chain.stages || [])) {
    if (stage.from && stage.to) {
      addT(iriFromId(stage.from), 'poke:evolvesTo', iriFromId(stage.to));
      addT(iriFromId(stage.to), 'poke:evolvesFrom', iriFromId(stage.from));
      evoCount++;
    }
  }
}
console.log(`  Evolution edges: ${evoCount}`);

writeJSON(path.join(OUT, 'triples.json'), triples);
console.log(`  triples.json: ${triples.length} triples`);

// ---------- turtle.ttl (sample for 6 pokemon) ----------
console.log('Building turtle.ttl (learning sample)...');

// Sample dex numbers: 피카츄(25), 라이츄(26), 피츄(172), 리자몽(6), 이상해씨(1), 뮤츠(150)
const SAMPLE_DEX = [25, 26, 172, 6, 1, 150];

function turtleObjectFor(o) {
  // o is either an IRI like "poke:Pokemon" / "xsd:integer" or a literal "...\"@ko" / "...\"^^xsd:type"
  return o;
}

const ttlLines = [];
ttlLines.push('@prefix poke: <http://example.org/poke#> .');
ttlLines.push('@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .');
ttlLines.push('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .');
ttlLines.push('@prefix owl: <http://www.w3.org/2002/07/owl#> .');
ttlLines.push('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .');
ttlLines.push('');
ttlLines.push('# ----- 학습용 샘플: 6마리의 포켓몬 트리플을 모은 Turtle 직렬화 -----');
ttlLines.push('');

// Build a quick subject -> [ [p,o], ... ] index for sample subjects only
const sampleIRIs = new Set(SAMPLE_DEX.map(d => `poke:pokemon-${d}`));
const bySubject = new Map();
for (const [s, p, o] of triples) {
  if (sampleIRIs.has(s)) {
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s).push([p, o]);
  }
}

for (const dex of SAMPLE_DEX) {
  const s = `poke:pokemon-${dex}`;
  const pos = bySubject.get(s) || [];
  if (!pos.length) continue;
  const p2o = new Map();
  for (const [p, o] of pos) {
    if (!p2o.has(p)) p2o.set(p, []);
    p2o.get(p).push(turtleObjectFor(o));
  }
  // emit
  const predicates = [];
  // bring rdf:type first, rdfs:label second
  const ordered = ['rdf:type', 'rdfs:label', ...[...p2o.keys()].filter(k => k !== 'rdf:type' && k !== 'rdfs:label')];
  for (const pred of ordered) {
    if (!p2o.has(pred)) continue;
    const objs = p2o.get(pred);
    const objStr = objs.join(', ');
    predicates.push(`    ${pred} ${objStr}`);
  }
  ttlLines.push(`${s}`);
  ttlLines.push(predicates.join(' ;\n') + ' .');
  ttlLines.push('');
}
// Add a few sample type relations
ttlLines.push('# ----- 타입 효과 샘플 (불꽃·물) -----');
ttlLines.push('poke:FireType a poke:Type ;');
ttlLines.push('    rdfs:label "불꽃타입"@ko ;');
ttlLines.push('    poke:strongAgainst poke:GrassType, poke:IceType, poke:BugType, poke:SteelType ;');
ttlLines.push('    poke:weakAgainst poke:WaterType, poke:GroundType, poke:RockType .');
ttlLines.push('');
ttlLines.push('poke:WaterType a poke:Type ;');
ttlLines.push('    rdfs:label "물타입"@ko ;');
ttlLines.push('    poke:strongAgainst poke:FireType, poke:GroundType, poke:RockType ;');
ttlLines.push('    poke:weakAgainst poke:GrassType, poke:ElectricType .');

fs.writeFileSync(path.join(OUT, 'turtle.ttl'), ttlLines.join('\n'));

// ---------- graph slices ----------
console.log('Building graph slices...');

const POKE_KO_BY_DEX = new Map(pokemon.map(p => [p.dexNumber, p.koName]));
const POKE_TYPES_BY_DEX = new Map(pokemon.map(p => [p.dexNumber, p.types]));
const POKE_BY_DEX = pokemonByDex;
const HABITAT_KO = Object.fromEntries(habitats.map(h => [h.id, h.koName]));
const EGG_KO = Object.fromEntries(eggGroups.map(e => [e.id, e.koName]));

function pokeNode(dex) {
  const p = POKE_BY_DEX.get(dex);
  return { id: `poke:pokemon-${dex}`, label: p?.koName || `#${dex}`, type: 'instance' };
}
function typeClassNode(typeId) {
  return { id: typeClassIRI(typeId), label: `${TYPE_KO_BY_EN[typeId.split(':')[1]]}타입`, type: 'class' };
}
function typePokemonClassNode(typeId) {
  return { id: typePokemonClassIRI(typeId), label: `${TYPE_KO_BY_EN[typeId.split(':')[1]]}타입 포켓몬`, type: 'class' };
}

function makeSlice(id, title, nodes, edges, highlight, layoutHint) {
  // deduplicate
  const nm = new Map();
  for (const n of nodes) if (!nm.has(n.id)) nm.set(n.id, n);
  const ek = new Set();
  const eOut = [];
  for (const e of edges) {
    const k = `${e.source}|${e.target}|${e.label}|${e.kind}`;
    if (ek.has(k)) continue;
    ek.add(k);
    eOut.push(e);
  }
  return { id, title, nodes: [...nm.values()], edges: eOut, highlight, layoutHint };
}

// ----- ch01: classification intuition (5 pokemon + 2 grouping examples) -----
{
  const dexes = [25, 4, 7, 1, 133];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    ...dexes.map(pokeNode)
  ];
  const edges = dexes.map(d => ({ source: `poke:pokemon-${d}`, target: 'poke:Pokemon', label: 'is-a', kind: 'is-a' }));
  writeJSON(path.join(SLICES, 'ch01.json'),
    makeSlice('ch01', '온톨로지란 무엇인가?', nodes, edges, ['poke:Pokemon'], 'breadthfirst'));
}

// ----- ch02: classes vs instances (Pokemon class + 4 instances + Pikachu lineage) -----
{
  const dexes = [25, 26, 172, 133];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    ...dexes.map(pokeNode)
  ];
  const edges = dexes.map(d => ({ source: `poke:pokemon-${d}`, target: 'poke:Pokemon', label: 'instance-of', kind: 'is-a' }));
  writeJSON(path.join(SLICES, 'ch02.json'),
    makeSlice('ch02', '클래스와 인스턴스', nodes, edges, ['poke:Pokemon', 'poke:pokemon-25'], 'breadthfirst'));
}

// ----- ch03: data property vs object property (Pikachu node with several attributes) -----
{
  const dexes = [25, 1, 133];
  const nodes = [
    ...dexes.map(pokeNode),
    { id: 'poke:ElectricType', label: '전기타입', type: 'class' },
    { id: 'poke:GrassType', label: '풀타입', type: 'class' },
    { id: 'lit:25:height', label: '0.4 m', type: 'literal' },
    { id: 'lit:25:weight', label: '6.0 kg', type: 'literal' },
    { id: 'lit:1:height', label: '0.7 m', type: 'literal' },
    { id: 'poke:pokemon-26', label: '라이츄', type: 'instance' }
  ];
  const edges = [
    { source: 'poke:pokemon-25', target: 'poke:ElectricType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'lit:25:height', label: 'height', kind: 'data' },
    { source: 'poke:pokemon-25', target: 'lit:25:weight', label: 'weight', kind: 'data' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-26', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:GrassType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'lit:1:height', label: 'height', kind: 'data' }
  ];
  writeJSON(path.join(SLICES, 'ch03.json'),
    makeSlice('ch03', '속성: 데이터와 객체', nodes, edges, ['poke:pokemon-25'], 'cose'));
}

// ----- ch04: triples (Pichu->Pikachu->Raichu, Eevee->Vaporeon) -----
{
  const dexes = [172, 25, 26, 133, 134];
  const nodes = dexes.map(pokeNode);
  nodes.push({ id: 'poke:ElectricType', label: '전기타입', type: 'class' });
  nodes.push({ id: 'poke:WaterType', label: '물타입', type: 'class' });
  const edges = [
    { source: 'poke:pokemon-172', target: 'poke:pokemon-25', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-26', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'poke:ElectricType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-134', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-134', target: 'poke:WaterType', label: 'hasType', kind: 'object' }
  ];
  writeJSON(path.join(SLICES, 'ch04.json'),
    makeSlice('ch04', '관계와 트리플', nodes, edges, ['poke:pokemon-25', 'poke:pokemon-26'], 'dagre'));
}

// ----- ch05: hierarchy/inheritance (Pokemon -> typed-pokemon -> instance, 3+ layers, dragon line) -----
{
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:ElectricTypePokemon', label: '전기타입 포켓몬', type: 'class' },
    { id: 'poke:DragonTypePokemon', label: '드래곤타입 포켓몬', type: 'class' },
    { id: 'poke:FlyingTypePokemon', label: '비행타입 포켓몬', type: 'class' },
    { id: 'poke:LegendaryPokemon', label: '전설의 포켓몬', type: 'class' },
    pokeNode(25), pokeNode(135), pokeNode(147), pokeNode(148), pokeNode(149), pokeNode(145)
  ];
  const edges = [
    { source: 'poke:ElectricTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:DragonTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:FlyingTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:LegendaryPokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:pokemon-25', target: 'poke:ElectricTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-135', target: 'poke:ElectricTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-147', target: 'poke:DragonTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-148', target: 'poke:DragonTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-149', target: 'poke:DragonTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-149', target: 'poke:FlyingTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-145', target: 'poke:LegendaryPokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-145', target: 'poke:ElectricTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-147', target: 'poke:pokemon-148', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-148', target: 'poke:pokemon-149', label: 'evolvesTo', kind: 'object' }
  ];
  writeJSON(path.join(SLICES, 'ch05.json'),
    makeSlice('ch05', '계층과 상속(is-a)', nodes, edges, ['poke:Pokemon', 'poke:DragonTypePokemon'], 'dagre'));
}

// ----- ch06: multiple inheritance / dual type -----
{
  const dexes = [6, 1, 130, 131, 94];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:FireTypePokemon', label: '불꽃타입 포켓몬', type: 'class' },
    { id: 'poke:FlyingTypePokemon', label: '비행타입 포켓몬', type: 'class' },
    { id: 'poke:GrassTypePokemon', label: '풀타입 포켓몬', type: 'class' },
    { id: 'poke:PoisonTypePokemon', label: '독타입 포켓몬', type: 'class' },
    { id: 'poke:WaterTypePokemon', label: '물타입 포켓몬', type: 'class' },
    { id: 'poke:IceTypePokemon', label: '얼음타입 포켓몬', type: 'class' },
    { id: 'poke:GhostTypePokemon', label: '고스트타입 포켓몬', type: 'class' },
    { id: 'poke:DualTypePokemon', label: '듀얼 타입 포켓몬', type: 'class' },
    ...dexes.map(pokeNode)
  ];
  const edges = [
    { source: 'poke:FireTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:FlyingTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:GrassTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:PoisonTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:WaterTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:IceTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:GhostTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:DualTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:pokemon-6', target: 'poke:FireTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-6', target: 'poke:FlyingTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-6', target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-1', target: 'poke:GrassTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-1', target: 'poke:PoisonTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-1', target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-130', target: 'poke:WaterTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-130', target: 'poke:FlyingTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-130', target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-131', target: 'poke:WaterTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-131', target: 'poke:IceTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-131', target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-94', target: 'poke:GhostTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-94', target: 'poke:PoisonTypePokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-94', target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' }
  ];
  writeJSON(path.join(SLICES, 'ch06.json'),
    makeSlice('ch06', '분류와 다중 상속', nodes, edges, ['poke:pokemon-6', 'poke:DualTypePokemon'], 'cose'));
}

// ----- ch07: domain/range -----
{
  const dexes = [25, 26, 1, 3, 4, 5];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:Type', label: '타입', type: 'class' },
    { id: 'poke:Habitat', label: '서식지', type: 'class' },
    { id: 'poke:EggGroup', label: '알그룹', type: 'class' },
    { id: 'poke:evolvesTo', label: '진화함 (객체 속성)', type: 'class' },
    { id: 'poke:hasType', label: '타입을_가짐 (객체 속성)', type: 'class' },
    { id: 'poke:livesIn', label: '서식지에_삼 (객체 속성)', type: 'class' },
    { id: 'poke:height', label: '키 (데이터 속성)', type: 'class' },
    ...dexes.map(pokeNode),
    { id: 'poke:FireType', label: '불꽃타입', type: 'class' },
    { id: 'poke:GrassType', label: '풀타입', type: 'class' },
    { id: 'poke:habitat-grassland', label: '초원', type: 'instance' }
  ];
  const edges = [
    { source: 'poke:evolvesTo', target: 'poke:Pokemon', label: 'domain', kind: 'is-a' },
    { source: 'poke:evolvesTo', target: 'poke:Pokemon', label: 'range', kind: 'is-a' },
    { source: 'poke:hasType', target: 'poke:Pokemon', label: 'domain', kind: 'is-a' },
    { source: 'poke:hasType', target: 'poke:Type', label: 'range', kind: 'is-a' },
    { source: 'poke:livesIn', target: 'poke:Pokemon', label: 'domain', kind: 'is-a' },
    { source: 'poke:livesIn', target: 'poke:Habitat', label: 'range', kind: 'is-a' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-26', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:GrassType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-4', target: 'poke:FireType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:habitat-grassland', label: 'livesIn', kind: 'object' }
  ];
  writeJSON(path.join(SLICES, 'ch07.json'),
    makeSlice('ch07', '도메인과 레인지', nodes, edges, ['poke:evolvesTo', 'poke:hasType'], 'cose'));
}

// ----- ch08: inverse / symmetric / transitive -----
{
  const dexes = [172, 25, 26, 133, 196, 134, 135, 136, 471];
  const nodes = dexes.map(pokeNode);
  nodes.push({ id: 'poke:evolvesTo', label: '진화함', type: 'class' });
  nodes.push({ id: 'poke:evolvesFrom', label: '진화_전(역관계)', type: 'class' });
  nodes.push({ id: 'poke:evolvesToEventually', label: '결국_진화함(전이)', type: 'class' });
  const edges = [
    { source: 'poke:evolvesTo', target: 'poke:evolvesFrom', label: 'inverseOf', kind: 'is-a' },
    { source: 'poke:pokemon-172', target: 'poke:pokemon-25', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-26', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-172', label: 'evolvesFrom', kind: 'object' },
    { source: 'poke:pokemon-26', target: 'poke:pokemon-25', label: 'evolvesFrom', kind: 'object' },
    { source: 'poke:pokemon-172', target: 'poke:pokemon-26', label: 'evolvesToEventually', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-134', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-135', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-136', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-196', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-133', target: 'poke:pokemon-471', label: 'evolvesTo', kind: 'object' }
  ];
  writeJSON(path.join(SLICES, 'ch08.json'),
    makeSlice('ch08', '역관계와 대칭성', nodes, edges, ['poke:evolvesTo', 'poke:pokemon-25'], 'dagre'));
}

// ----- ch09: RDF/Turtle (small concrete Pikachu graph that maps to Turtle in viewer) -----
{
  const dexes = [25, 26, 172, 1, 2];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:ElectricType', label: '전기타입', type: 'class' },
    { id: 'poke:GrassType', label: '풀타입', type: 'class' },
    { id: 'poke:PoisonType', label: '독타입', type: 'class' },
    ...dexes.map(pokeNode),
    { id: 'lit:25:dex', label: '25', type: 'literal' },
    { id: 'lit:25:h', label: '0.4', type: 'literal' },
    { id: 'lit:25:hp', label: '35', type: 'literal' }
  ];
  const edges = [
    { source: 'poke:pokemon-25', target: 'poke:Pokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-26', target: 'poke:Pokemon', label: 'type', kind: 'is-a' },
    { source: 'poke:pokemon-25', target: 'poke:ElectricType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-26', target: 'poke:ElectricType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-172', target: 'poke:pokemon-25', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'poke:pokemon-26', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:GrassType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:PoisonType', label: 'hasType', kind: 'object' },
    { source: 'poke:pokemon-1', target: 'poke:pokemon-2', label: 'evolvesTo', kind: 'object' },
    { source: 'poke:pokemon-25', target: 'lit:25:dex', label: 'dexNumber', kind: 'data' },
    { source: 'poke:pokemon-25', target: 'lit:25:h', label: 'height', kind: 'data' },
    { source: 'poke:pokemon-25', target: 'lit:25:hp', label: 'hp', kind: 'data' }
  ];
  writeJSON(path.join(SLICES, 'ch09.json'),
    makeSlice('ch09', 'RDF와 Turtle', nodes, edges, ['poke:pokemon-25'], 'cose'));
}

// ----- ch10: SPARQL intro — all electric-type gen-1 pokemon -----
{
  const electricDex = pokemon.filter(p => p.types.includes('type:electric') && p.generation === 'gen:1').map(p => p.dexNumber);
  const dexes = electricDex.slice(0, 25); // cap
  const nodes = [
    { id: 'poke:ElectricTypePokemon', label: '전기타입 포켓몬', type: 'class' },
    { id: 'poke:gen-1', label: '1세대', type: 'instance' },
    { id: 'poke:ElectricType', label: '전기타입', type: 'class' },
    ...dexes.map(pokeNode)
  ];
  const edges = [];
  for (const d of dexes) {
    edges.push({ source: `poke:pokemon-${d}`, target: 'poke:ElectricType', label: 'hasType', kind: 'object' });
    edges.push({ source: `poke:pokemon-${d}`, target: 'poke:gen-1', label: 'fromGeneration', kind: 'object' });
  }
  writeJSON(path.join(SLICES, 'ch10.json'),
    makeSlice('ch10', 'SPARQL 입문 - 전기타입 1세대', nodes, edges,
      ['poke:ElectricType', 'poke:gen-1'], 'concentric'));
}

// ----- ch11: SPARQL aggregation — generation averages of stats (representative pokemon per gen) -----
{
  // pick 6 representatives per generation that exist in pokemon set
  const nodes = [];
  const edges = [];
  const genIds = generations.map(g => g.id);
  for (const g of genIds) {
    nodes.push({ id: iriFromId(g), label: generations.find(x => x.id === g).koName, type: 'instance' });
  }
  // pick top stat pokemon per generation
  const picksPerGen = 6;
  let total = 0;
  for (const g of genIds) {
    const inGen = pokemon.filter(p => p.generation === g);
    const sorted = inGen.sort((a, b) => {
      const sa = (a.stats?.hp||0)+(a.stats?.atk||0)+(a.stats?.def||0)+(a.stats?.spAtk||0)+(a.stats?.spDef||0)+(a.stats?.speed||0);
      const sb = (b.stats?.hp||0)+(b.stats?.atk||0)+(b.stats?.def||0)+(b.stats?.spAtk||0)+(b.stats?.spDef||0)+(b.stats?.speed||0);
      return sb - sa;
    });
    const top = sorted.slice(0, picksPerGen);
    for (const t of top) {
      nodes.push(pokeNode(t.dexNumber));
      edges.push({ source: `poke:pokemon-${t.dexNumber}`, target: iriFromId(g), label: 'fromGeneration', kind: 'object' });
      total++;
      if (total >= 60) break;
    }
    if (total >= 60) break;
  }
  writeJSON(path.join(SLICES, 'ch11.json'),
    makeSlice('ch11', 'SPARQL 심화 - 세대별 강력 포켓몬', nodes, edges,
      ['poke:gen-1'], 'concentric'));
}

// ----- ch12: OWL - legendary, dual-type, equivalent class -----
{
  const dexes = [144, 145, 146, 150, 151, 6, 130, 149, 248, 384];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:LegendaryPokemon', label: '전설의 포켓몬', type: 'class' },
    { id: 'poke:MythicalPokemon', label: '환상의 포켓몬', type: 'class' },
    { id: 'poke:DualTypePokemon', label: '듀얼 타입 포켓몬', type: 'class' },
    { id: 'lit:isLegendary:true', label: 'isLegendary=true', type: 'literal' },
    ...dexes.map(pokeNode)
  ];
  const edges = [
    { source: 'poke:LegendaryPokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:MythicalPokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:DualTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:LegendaryPokemon', target: 'lit:isLegendary:true', label: 'restriction(isLegendary value true)', kind: 'data' }
  ];
  for (const d of dexes) {
    const p = POKE_BY_DEX.get(d);
    if (p?.isLegendary) edges.push({ source: `poke:pokemon-${d}`, target: 'poke:LegendaryPokemon', label: 'type', kind: 'is-a' });
    if (p?.isMythical) edges.push({ source: `poke:pokemon-${d}`, target: 'poke:MythicalPokemon', label: 'type', kind: 'is-a' });
    if (p?.types?.length >= 2) edges.push({ source: `poke:pokemon-${d}`, target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' });
  }
  writeJSON(path.join(SLICES, 'ch12.json'),
    makeSlice('ch12', 'OWL과 표현력', nodes, edges,
      ['poke:LegendaryPokemon', 'poke:DualTypePokemon'], 'dagre'));
}

// ----- ch13: reasoning — Eevee evolutions explosion -----
{
  // Eevee = 133. Eeveelutions: 134~136, 196, 197, 470, 471, 700
  const eeveeDex = [133, 134, 135, 136, 196, 197, 470, 471, 700];
  const dexes = [...eeveeDex];
  const nodes = [
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:evolvesTo', label: '진화함', type: 'class' },
    { id: 'poke:evolvesFrom', label: '진화_전 (역관계)', type: 'class' },
    { id: 'poke:WaterTypePokemon', label: '물타입 포켓몬', type: 'class' },
    { id: 'poke:ElectricTypePokemon', label: '전기타입 포켓몬', type: 'class' },
    { id: 'poke:FireTypePokemon', label: '불꽃타입 포켓몬', type: 'class' },
    { id: 'poke:PsychicTypePokemon', label: '에스퍼타입 포켓몬', type: 'class' },
    { id: 'poke:DarkTypePokemon', label: '악타입 포켓몬', type: 'class' },
    { id: 'poke:GrassTypePokemon', label: '풀타입 포켓몬', type: 'class' },
    { id: 'poke:IceTypePokemon', label: '얼음타입 포켓몬', type: 'class' },
    { id: 'poke:FairyTypePokemon', label: '페어리타입 포켓몬', type: 'class' },
    ...dexes.map(pokeNode)
  ];
  const edges = [];
  // asserted evolves edges
  for (const d of eeveeDex.slice(1)) {
    edges.push({ source: 'poke:pokemon-133', target: `poke:pokemon-${d}`, label: 'evolvesTo (asserted)', kind: 'object' });
    edges.push({ source: `poke:pokemon-${d}`, target: 'poke:pokemon-133', label: 'evolvesFrom (inferred)', kind: 'object' });
  }
  // type inferences
  for (const d of dexes) {
    const p = POKE_BY_DEX.get(d);
    for (const t of (p?.types || [])) {
      edges.push({ source: `poke:pokemon-${d}`, target: typePokemonClassIRI(t), label: 'type (inferred)', kind: 'is-a' });
    }
  }
  writeJSON(path.join(SLICES, 'ch13.json'),
    makeSlice('ch13', '추론 - 이브이의 진화 가족', nodes, edges,
      ['poke:pokemon-133'], 'breadthfirst'));
}

// ----- ch14: upper ontology — bigger snapshot, 60-150 nodes -----
{
  // pick representative pokemon: starters + a few legendaries + popular pokemon across generations
  const repsDex = [
    1, 4, 7, 25, 26, 133, 134, 135, 136, 6, 9, 3, 150, 151,
    152, 155, 158, 196, 197, 248,
    252, 255, 258, 384, 386,
    387, 390, 393, 470, 471, 491,
    495, 498, 501, 643, 644, 646,
    650, 653, 656, 716, 717, 718,
    722, 725, 728, 791, 792, 800,
    810, 813, 816, 887, 888, 890,
    906, 909, 912, 997, 1007, 1008
  ];
  // keep only ones that exist
  const dexes = repsDex.filter(d => POKE_BY_DEX.has(d));
  const nodes = [
    { id: 'poke:Entity', label: '실체(Entity)', type: 'class' },
    { id: 'poke:FictionalCharacter', label: '가상의 존재', type: 'class' },
    { id: 'poke:GameCharacter', label: '게임 캐릭터', type: 'class' },
    { id: 'poke:Pokemon', label: '포켓몬', type: 'class' },
    { id: 'poke:LegendaryPokemon', label: '전설의 포켓몬', type: 'class' },
    { id: 'poke:MythicalPokemon', label: '환상의 포켓몬', type: 'class' },
    { id: 'poke:DualTypePokemon', label: '듀얼 타입 포켓몬', type: 'class' }
  ];
  // typed-pokemon classes (all 18)
  for (const t of types) nodes.push({ id: typePokemonClassIRI(t.id), label: `${t.koName}타입 포켓몬`, type: 'class' });
  // generation instances
  for (const g of generations) nodes.push({ id: iriFromId(g.id), label: g.koName, type: 'instance' });
  // pokemon instances
  for (const d of dexes) nodes.push(pokeNode(d));

  const edges = [
    { source: 'poke:FictionalCharacter', target: 'poke:Entity', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:GameCharacter', target: 'poke:FictionalCharacter', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:Pokemon', target: 'poke:GameCharacter', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:LegendaryPokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:MythicalPokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' },
    { source: 'poke:DualTypePokemon', target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' }
  ];
  for (const t of types) {
    edges.push({ source: typePokemonClassIRI(t.id), target: 'poke:Pokemon', label: 'subClassOf', kind: 'is-a' });
  }
  // pokemon -> typed-pokemon class + generation
  for (const d of dexes) {
    const p = POKE_BY_DEX.get(d);
    for (const t of (p?.types || [])) {
      edges.push({ source: `poke:pokemon-${d}`, target: typePokemonClassIRI(t), label: 'type', kind: 'is-a' });
    }
    if (p?.generation) {
      edges.push({ source: `poke:pokemon-${d}`, target: iriFromId(p.generation), label: 'fromGeneration', kind: 'object' });
    }
    if (p?.isLegendary) {
      edges.push({ source: `poke:pokemon-${d}`, target: 'poke:LegendaryPokemon', label: 'type', kind: 'is-a' });
    }
    if (p?.isMythical) {
      edges.push({ source: `poke:pokemon-${d}`, target: 'poke:MythicalPokemon', label: 'type', kind: 'is-a' });
    }
    if ((p?.types || []).length >= 2) {
      edges.push({ source: `poke:pokemon-${d}`, target: 'poke:DualTypePokemon', label: 'type', kind: 'is-a' });
    }
  }
  writeJSON(path.join(SLICES, 'ch14.json'),
    makeSlice('ch14', '상위 온톨로지와 재사용', nodes, edges,
      ['poke:Entity', 'poke:Pokemon'], 'dagre'));
}

// ---------- inference-rules.json ----------
console.log('Building inference-rules.json...');
const rules = [
  {
    id: 'rule-inverse-evolution',
    koLabel: '진화의 역관계',
    if: [['?a', 'poke:evolvesTo', '?b']],
    then: [['?b', 'poke:evolvesFrom', '?a']],
    koExplanation: 'A가 B로 진화한다면, 자동으로 B의 진화 전은 A입니다. evolvesFrom은 evolvesTo의 역관계예요.'
  },
  {
    id: 'rule-transitive-evolution',
    koLabel: '진화의 추이성',
    if: [['?a', 'poke:evolvesTo', '?b'], ['?b', 'poke:evolvesTo', '?c']],
    then: [['?a', 'poke:evolvesToEventually', '?c']],
    koExplanation: 'A가 B로 진화하고 B가 C로 진화하면, A는 결국 C로 진화한다고 말할 수 있어요(예: 피츄 → 라이츄).'
  },
  {
    id: 'rule-fire-type-pokemon',
    koLabel: '불꽃타입 포켓몬 자동 분류',
    if: [['?p', 'rdf:type', 'poke:Pokemon'], ['?p', 'poke:hasType', 'poke:FireType']],
    then: [['?p', 'rdf:type', 'poke:FireTypePokemon']],
    koExplanation: '어떤 포켓몬이 불꽃 타입을 가지면, 자동으로 \'불꽃타입 포켓몬\' 클래스의 멤버가 됩니다.'
  },
  {
    id: 'rule-water-type-pokemon',
    koLabel: '물타입 포켓몬 자동 분류',
    if: [['?p', 'rdf:type', 'poke:Pokemon'], ['?p', 'poke:hasType', 'poke:WaterType']],
    then: [['?p', 'rdf:type', 'poke:WaterTypePokemon']],
    koExplanation: '어떤 포켓몬이 물 타입을 가지면, 자동으로 \'물타입 포켓몬\' 클래스의 멤버가 됩니다.'
  },
  {
    id: 'rule-electric-type-pokemon',
    koLabel: '전기타입 포켓몬 자동 분류',
    if: [['?p', 'rdf:type', 'poke:Pokemon'], ['?p', 'poke:hasType', 'poke:ElectricType']],
    then: [['?p', 'rdf:type', 'poke:ElectricTypePokemon']],
    koExplanation: '어떤 포켓몬이 전기 타입을 가지면, 자동으로 \'전기타입 포켓몬\' 클래스의 멤버가 됩니다.'
  },
  {
    id: 'rule-dual-type',
    koLabel: '듀얼 타입 자동 분류',
    if: [['?p', 'poke:hasType', '?t1'], ['?p', 'poke:hasType', '?t2'], ['FILTER', '?t1 != ?t2']],
    then: [['?p', 'rdf:type', 'poke:DualTypePokemon']],
    koExplanation: '서로 다른 두 타입을 동시에 가진 포켓몬은 \'듀얼 타입 포켓몬\'이 됩니다 (예: 리자몽은 불꽃·비행).'
  },
  {
    id: 'rule-legendary-by-property',
    koLabel: '전설의 포켓몬 자동 분류',
    if: [['?p', 'rdf:type', 'poke:Pokemon'], ['?p', 'poke:isLegendary', '"true"^^xsd:boolean']],
    then: [['?p', 'rdf:type', 'poke:LegendaryPokemon']],
    koExplanation: 'isLegendary 값이 true인 포켓몬은 \'전설의 포켓몬\' 클래스의 멤버로 자동 분류됩니다 (OWL의 hasValue 제약).'
  },
  {
    id: 'rule-strong-against-symmetric',
    koLabel: '효과 뛰어남/별로의 양방향 관계',
    if: [['?a', 'poke:strongAgainst', '?b']],
    then: [['?b', 'poke:weakAgainst', '?a']],
    koExplanation: 'A가 B에 효과 뛰어남이면, B는 A에 효과가 별로입니다. weakAgainst는 strongAgainst의 역관계예요.'
  }
];
writeJSON(path.join(OUT, 'inference-rules.json'), rules);

// ---------- report ----------
console.log('\n===== BUILD COMPLETE =====');
console.log(`schema.json:           ${kbOf(path.join(OUT, 'schema.json'))} KB | ${classes.length} classes, ${properties.length} properties`);
console.log(`triples.json:          ${kbOf(path.join(OUT, 'triples.json'))} KB | ${triples.length} triples`);
console.log(`turtle.ttl:            ${kbOf(path.join(OUT, 'turtle.ttl'))} KB`);
console.log(`inference-rules.json:  ${kbOf(path.join(OUT, 'inference-rules.json'))} KB | ${rules.length} rules`);

const sliceFiles = fs.readdirSync(SLICES).filter(f => f.endsWith('.json')).sort();
for (const f of sliceFiles) {
  const fp = path.join(SLICES, f);
  const j = readJSON(fp);
  console.log(`graph-slices/${f}:  ${kbOf(fp)} KB | nodes=${j.nodes.length} edges=${j.edges.length}`);
}
