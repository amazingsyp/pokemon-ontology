#!/usr/bin/env node
/**
 * PokeAPI -> _workspace/data/*.json (Korean-first, normalized for embedding)
 *
 * Run:
 *   node scripts/fetch-data.js
 *   node scripts/fetch-data.js --no-cache
 *   node scripts/fetch-data.js --retry-failed
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// -----------------------------------------------------------------------------
// Paths & flags
// -----------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CACHE_DIR = join(ROOT, '_workspace', 'cache');
const DATA_DIR = join(ROOT, '_workspace', 'data');
const API = 'https://pokeapi.co/api/v2';

const args = new Set(process.argv.slice(2));
const NO_CACHE = args.has('--no-cache');
const RETRY_FAILED = args.has('--retry-failed');

const CONCURRENCY = 8;
const RETRIES = 3;
const TIMEOUT_MS = 30_000;

mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(DATA_DIR, { recursive: true });

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
const sha1 = (s) => createHash('sha1').update(s).digest('hex');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function idFromUrl(url) {
  // strip trailing slash, take last segment
  const m = String(url).replace(/\/+$/, '').split('/');
  return m[m.length - 1];
}

function pickKoName(names) {
  if (!names) return null;
  return (
    names.find((n) => n.language?.name === 'ko')?.name ||
    names.find((n) => n.language?.name === 'ko-Hrkt')?.name ||
    names.find((n) => n.language?.name === 'en')?.name ||
    null
  );
}

function cleanFlavor(txt) {
  if (!txt) return null;
  return String(txt).replace(/\f|\n|\r/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickKoFlavor(flavorTextEntries) {
  if (!flavorTextEntries || flavorTextEntries.length === 0) return null;
  // ko entries; PokeAPI orders chronologically; we pick the LAST (most recent)
  const koEntries = flavorTextEntries.filter(
    (e) => e.language?.name === 'ko' || e.language?.name === 'ko-Hrkt',
  );
  if (koEntries.length > 0) {
    return { text: cleanFlavor(koEntries[koEntries.length - 1].flavor_text), lang: 'ko' };
  }
  const enEntries = flavorTextEntries.filter((e) => e.language?.name === 'en');
  if (enEntries.length > 0) {
    return { text: cleanFlavor(enEntries[enEntries.length - 1].flavor_text), lang: 'en' };
  }
  return null;
}

function pickKoEffect(effectEntries) {
  if (!effectEntries) return null;
  const ko = effectEntries.find((e) => e.language?.name === 'ko');
  if (ko) return cleanFlavor(ko.short_effect || ko.effect);
  const en = effectEntries.find((e) => e.language?.name === 'en');
  if (en) return cleanFlavor(en.short_effect || en.effect);
  return null;
}

// -----------------------------------------------------------------------------
// Simple p-limit
// -----------------------------------------------------------------------------
function pLimit(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (queue.length === 0 || active >= n) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(
      (v) => {
        active--;
        resolve(v);
        next();
      },
      (e) => {
        active--;
        reject(e);
        next();
      },
    );
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

// -----------------------------------------------------------------------------
// Cached + retry fetch
// -----------------------------------------------------------------------------
const failed = []; // { url, error }

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${url}`);
      err.status = res.status;
      throw err;
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function cachedFetch(url) {
  const key = sha1(url);
  const cachePath = join(CACHE_DIR, `${key}.json`);
  if (!NO_CACHE && existsSync(cachePath)) {
    try {
      return JSON.parse(readFileSync(cachePath, 'utf8'));
    } catch {
      // corrupt cache, refetch
    }
  }
  let lastErr;
  for (let i = 0; i < RETRIES; i++) {
    try {
      const data = await fetchJSON(url);
      writeFileSync(cachePath, JSON.stringify(data));
      return data;
    } catch (e) {
      lastErr = e;
      // 404 -> no point retrying
      if (e.status === 404) break;
      const backoff = 500 * Math.pow(2, i) + Math.random() * 250;
      await sleep(backoff);
    }
  }
  failed.push({ url, error: String(lastErr?.message || lastErr) });
  return null;
}

// -----------------------------------------------------------------------------
// Progress
// -----------------------------------------------------------------------------
function makeProgress(label, total) {
  let done = 0;
  const start = Date.now();
  return {
    tick() {
      done++;
      // throttle output so terminal isn't overwhelmed
      if (done === total || done % 10 === 0 || done < 5) {
        const pct = ((done / total) * 100).toFixed(1);
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        process.stdout.write(`\r  ${label}: ${done}/${total} (${pct}%) ${elapsed}s`);
      }
    },
    end() {
      process.stdout.write('\n');
    },
  };
}

// -----------------------------------------------------------------------------
// Korean trigger mapping (evolution triggers + small terms)
// -----------------------------------------------------------------------------
const KO_TRIGGER = {
  'level-up': '레벨업',
  trade: '교환',
  'use-item': '도구 사용',
  shed: '탈피',
  spin: '회전',
  'tower-of-darkness': '어둠의 탑',
  'tower-of-waters': '물의 탑',
  'three-critical-hits': '급소 3회',
  'take-damage': '피해 받기',
  other: '특수 조건',
  'agile-style-move': '날렵한 스타일 기술',
  'strong-style-move': '강인한 스타일 기술',
  'recoil-damage': '반동 데미지',
};

function describeEvolutionStage(details, fromId, toId) {
  // details may have multiple entries; we summarize first
  if (!details || details.length === 0) return { trigger: 'unknown', koTrigger: '조건 미상' };
  const d = details[0];
  const triggerName = d.trigger?.name || 'unknown';
  const parts = [];
  const out = { trigger: triggerName, koTrigger: KO_TRIGGER[triggerName] || triggerName };
  if (d.min_level != null) {
    parts.push(`레벨 ${d.min_level}`);
    out.minLevel = d.min_level;
  }
  if (d.item?.name) {
    parts.push(`도구: ${d.item.name}`);
    out.item = d.item.name;
  }
  if (d.held_item?.name) {
    parts.push(`소지품: ${d.held_item.name}`);
    out.heldItem = d.held_item.name;
  }
  if (d.min_happiness != null) {
    parts.push(`친밀도 ${d.min_happiness}`);
    out.minHappiness = d.min_happiness;
  }
  if (d.min_affection != null) {
    parts.push(`사랑도 ${d.min_affection}`);
    out.minAffection = d.min_affection;
  }
  if (d.min_beauty != null) {
    parts.push(`아름다움 ${d.min_beauty}`);
    out.minBeauty = d.min_beauty;
  }
  if (d.time_of_day) {
    parts.push(`시간대: ${d.time_of_day}`);
    out.timeOfDay = d.time_of_day;
  }
  if (d.location?.name) {
    parts.push(`장소: ${d.location.name}`);
    out.location = d.location.name;
  }
  if (d.known_move?.name) {
    parts.push(`습득기술: ${d.known_move.name}`);
    out.knownMove = d.known_move.name;
  }
  if (d.known_move_type?.name) {
    parts.push(`습득 기술 타입: ${d.known_move_type.name}`);
    out.knownMoveType = d.known_move_type.name;
  }
  if (d.gender != null) {
    parts.push(`성별: ${d.gender === 1 ? '암컷' : d.gender === 2 ? '수컷' : d.gender}`);
    out.gender = d.gender;
  }
  if (d.needs_overworld_rain) {
    parts.push('비');
    out.needsOverworldRain = true;
  }
  if (d.turn_upside_down) {
    parts.push('거꾸로');
    out.turnUpsideDown = true;
  }
  if (parts.length > 0) {
    out.koTrigger = `${out.koTrigger} (${parts.join(', ')})`;
  }
  out.from = fromId;
  out.to = toId;
  return out;
}

function flattenChain(chain, stages, koSpeciesNameById) {
  const fromSpeciesId = idFromUrl(chain.species.url);
  for (const evo of chain.evolves_to || []) {
    const toSpeciesId = idFromUrl(evo.species.url);
    const stage = describeEvolutionStage(
      evo.evolution_details,
      `pokemon:${fromSpeciesId}`,
      `pokemon:${toSpeciesId}`,
    );
    stages.push(stage);
    flattenChain(evo, stages, koSpeciesNameById);
  }
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  const T0 = Date.now();
  console.log('=== PokeAPI Korean data pipeline ===');
  console.log(`cache: ${NO_CACHE ? 'OFF' : 'ON'} | concurrency: ${CONCURRENCY} | retries: ${RETRIES}`);

  // ---- 1. species index --------------------------------------------------
  console.log('\n[1/8] 종 인덱스 가져오기...');
  const speciesIndex = await cachedFetch(`${API}/pokemon-species?limit=2000`);
  if (!speciesIndex) throw new Error('species index fetch failed');
  const speciesList = speciesIndex.results.map((r) => ({
    id: Number(idFromUrl(r.url)),
    name: r.name,
    url: r.url,
  }));
  speciesList.sort((a, b) => a.id - b.id);
  console.log(`  종 수: ${speciesList.length}`);

  // ---- 2. fetch all species + matching pokemon (default form) -----------
  console.log('\n[2/8] 종마다 species + pokemon fetch...');
  const limit = pLimit(CONCURRENCY);
  const prog2 = makeProgress('species', speciesList.length);

  const speciesData = new Map(); // id -> species json
  const pokemonData = new Map(); // species id -> pokemon json (default form)

  await Promise.all(
    speciesList.map((sp) =>
      limit(async () => {
        const species = await cachedFetch(`${API}/pokemon-species/${sp.id}`);
        if (species) {
          speciesData.set(sp.id, species);
          // default variety
          const defaultVariety =
            species.varieties?.find((v) => v.is_default) || species.varieties?.[0];
          if (defaultVariety) {
            const pkmId = idFromUrl(defaultVariety.pokemon.url);
            const pkm = await cachedFetch(`${API}/pokemon/${pkmId}`);
            if (pkm) pokemonData.set(sp.id, pkm);
          }
        }
        prog2.tick();
      }),
    ),
  );
  prog2.end();
  console.log(`  species 수집: ${speciesData.size}, pokemon 수집: ${pokemonData.size}`);

  // ---- 3. evolution chains ----------------------------------------------
  console.log('\n[3/8] 진화 체인 수집...');
  const chainIds = new Set();
  for (const sp of speciesData.values()) {
    if (sp.evolution_chain?.url) chainIds.add(Number(idFromUrl(sp.evolution_chain.url)));
  }
  const chainArr = [...chainIds].sort((a, b) => a - b);
  const prog3 = makeProgress('chains', chainArr.length);
  const chainData = new Map();
  await Promise.all(
    chainArr.map((cid) =>
      limit(async () => {
        const c = await cachedFetch(`${API}/evolution-chain/${cid}`);
        if (c) chainData.set(cid, c);
        prog3.tick();
      }),
    ),
  );
  prog3.end();
  console.log(`  체인 수집: ${chainData.size}`);

  // ---- 4. reference resources: types, abilities, moves, etc -------------
  console.log('\n[4/8] 참조 자원 수집...');

  // collect referenced ability and move IDs from pokemonData
  const abilityIds = new Set();
  const moveIds = new Set();
  for (const pkm of pokemonData.values()) {
    for (const a of pkm.abilities || []) {
      if (a.ability?.url) abilityIds.add(Number(idFromUrl(a.ability.url)));
    }
    for (const m of pkm.moves || []) {
      if (m.move?.url) moveIds.add(Number(idFromUrl(m.move.url)));
    }
  }

  // type index (all 18+)
  const typeIndex = await cachedFetch(`${API}/type?limit=100`);
  const typeIdList = (typeIndex?.results || [])
    .map((r) => Number(idFromUrl(r.url)))
    // exclude unknown/shadow ids 10001+ if present (only keep main 18)
    .filter((id) => id <= 18);

  // habitat, generation, color, shape, egg-group indices
  const habitatIndex = await cachedFetch(`${API}/pokemon-habitat?limit=100`);
  const generationIndex = await cachedFetch(`${API}/generation?limit=100`);
  const colorIndex = await cachedFetch(`${API}/pokemon-color?limit=100`);
  const shapeIndex = await cachedFetch(`${API}/pokemon-shape?limit=100`);
  const eggGroupIndex = await cachedFetch(`${API}/egg-group?limit=100`);

  const habitatIds = (habitatIndex?.results || []).map((r) => Number(idFromUrl(r.url)));
  const generationIds = (generationIndex?.results || []).map((r) => Number(idFromUrl(r.url)));
  const colorIds = (colorIndex?.results || []).map((r) => Number(idFromUrl(r.url)));
  const shapeIds = (shapeIndex?.results || []).map((r) => Number(idFromUrl(r.url)));
  const eggGroupIds = (eggGroupIndex?.results || []).map((r) => Number(idFromUrl(r.url)));

  console.log(
    `  refs: types=${typeIdList.length}, abilities=${abilityIds.size}, moves=${moveIds.size}, habitats=${habitatIds.length}, generations=${generationIds.length}, colors=${colorIds.length}, shapes=${shapeIds.length}, eggGroups=${eggGroupIds.length}`,
  );

  // fetch types
  const typesProg = makeProgress('types', typeIdList.length);
  const typeData = new Map();
  await Promise.all(
    typeIdList.map((id) =>
      limit(async () => {
        const t = await cachedFetch(`${API}/type/${id}`);
        if (t) typeData.set(id, t);
        typesProg.tick();
      }),
    ),
  );
  typesProg.end();

  // abilities
  const abIds = [...abilityIds].sort((a, b) => a - b);
  const abProg = makeProgress('abilities', abIds.length);
  const abilityData = new Map();
  await Promise.all(
    abIds.map((id) =>
      limit(async () => {
        const a = await cachedFetch(`${API}/ability/${id}`);
        if (a) abilityData.set(id, a);
        abProg.tick();
      }),
    ),
  );
  abProg.end();

  // moves
  const mvIds = [...moveIds].sort((a, b) => a - b);
  const mvProg = makeProgress('moves', mvIds.length);
  const moveData = new Map();
  await Promise.all(
    mvIds.map((id) =>
      limit(async () => {
        const m = await cachedFetch(`${API}/move/${id}`);
        if (m) moveData.set(id, m);
        mvProg.tick();
      }),
    ),
  );
  mvProg.end();

  // habitats
  const habProg = makeProgress('habitats', habitatIds.length);
  const habitatData = new Map();
  await Promise.all(
    habitatIds.map((id) =>
      limit(async () => {
        const h = await cachedFetch(`${API}/pokemon-habitat/${id}`);
        if (h) habitatData.set(id, h);
        habProg.tick();
      }),
    ),
  );
  habProg.end();

  // generations
  const genProg = makeProgress('generations', generationIds.length);
  const generationData = new Map();
  await Promise.all(
    generationIds.map((id) =>
      limit(async () => {
        const g = await cachedFetch(`${API}/generation/${id}`);
        if (g) generationData.set(id, g);
        genProg.tick();
      }),
    ),
  );
  genProg.end();

  // colors
  const colorProg = makeProgress('colors', colorIds.length);
  const colorData = new Map();
  await Promise.all(
    colorIds.map((id) =>
      limit(async () => {
        const c = await cachedFetch(`${API}/pokemon-color/${id}`);
        if (c) colorData.set(id, c);
        colorProg.tick();
      }),
    ),
  );
  colorProg.end();

  // shapes
  const shapeProg = makeProgress('shapes', shapeIds.length);
  const shapeMap = new Map();
  await Promise.all(
    shapeIds.map((id) =>
      limit(async () => {
        const s = await cachedFetch(`${API}/pokemon-shape/${id}`);
        if (s) shapeMap.set(id, s);
        shapeProg.tick();
      }),
    ),
  );
  shapeProg.end();

  // egg groups
  const egProg = makeProgress('egg-groups', eggGroupIds.length);
  const eggGroupData = new Map();
  await Promise.all(
    eggGroupIds.map((id) =>
      limit(async () => {
        const e = await cachedFetch(`${API}/egg-group/${id}`);
        if (e) eggGroupData.set(id, e);
        egProg.tick();
      }),
    ),
  );
  egProg.end();

  // ---- 5. Normalize -----------------------------------------------------
  console.log('\n[5/8] 정규화 중...');
  const koFallback = []; // ids that fell back to en

  // build maps for slug -> ko name (for moves, abilities, types, etc.)
  const typeSlugToKo = new Map();
  for (const t of typeData.values()) {
    typeSlugToKo.set(t.name, pickKoName(t.names));
  }

  // pokemon
  const pokemonItems = [];
  for (const sp of speciesList) {
    const species = speciesData.get(sp.id);
    const pkm = pokemonData.get(sp.id);
    if (!species || !pkm) {
      failed.push({ url: `species:${sp.id}`, error: 'species or pokemon missing' });
      continue;
    }
    const koName = pickKoName(species.names);
    const koFlavor = pickKoFlavor(species.flavor_text_entries);
    if (!species.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`pokemon:${sp.id}`);
    }

    const stats = {};
    for (const s of pkm.stats || []) {
      const map = {
        hp: 'hp',
        attack: 'atk',
        defense: 'def',
        'special-attack': 'spAtk',
        'special-defense': 'spDef',
        speed: 'speed',
      };
      const key = map[s.stat?.name];
      if (key) stats[key] = s.base_stat;
    }

    pokemonItems.push({
      id: `pokemon:${sp.id}`,
      dexNumber: sp.id,
      koName,
      enName: sp.name,
      types: (pkm.types || [])
        .sort((a, b) => a.slot - b.slot)
        .map((t) => `type:${t.type.name}`),
      generation: species.generation ? `gen:${idFromUrl(species.generation.url)}` : null,
      stats,
      height: pkm.height ?? null,
      weight: pkm.weight ?? null,
      abilities: (pkm.abilities || [])
        .sort((a, b) => a.slot - b.slot)
        .map((a) => `ability:${a.ability.name}`),
      habitat: species.habitat ? `habitat:${species.habitat.name}` : null,
      color: species.color ? `color:${species.color.name}` : null,
      shape: species.shape ? `shape:${species.shape.name}` : null,
      isLegendary: !!species.is_legendary,
      isMythical: !!species.is_mythical,
      isBaby: !!species.is_baby,
      evolutionChainId: species.evolution_chain
        ? `evolution:${idFromUrl(species.evolution_chain.url)}`
        : null,
      evolvesFromSpeciesId: species.evolves_from_species
        ? `pokemon:${idFromUrl(species.evolves_from_species.url)}`
        : null,
      captureRate: species.capture_rate ?? null,
      baseHappiness: species.base_happiness ?? null,
      growthRate: species.growth_rate?.name || null,
      genderRate: species.gender_rate ?? null,
      hatchCounter: species.hatch_counter ?? null,
      eggGroups: (species.egg_groups || []).map((g) => `egg-group:${g.name}`),
      moves: (pkm.moves || []).map((m) => `move:${m.move.name}`),
      koFlavor: koFlavor?.text || null,
      koFlavorLang: koFlavor?.lang || null,
    });
  }

  // types
  const typeItems = [];
  for (const t of typeData.values()) {
    const koName = pickKoName(t.names);
    if (!t.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`type:${t.name}`);
    }
    const rel = t.damage_relations || {};
    typeItems.push({
      id: `type:${t.name}`,
      enName: t.name,
      koName,
      // strongAgainst = deals 2x to (double_damage_to)
      strongAgainst: (rel.double_damage_to || []).map((x) => `type:${x.name}`),
      // weakAgainst = takes 2x from (double_damage_from)
      weakAgainst: (rel.double_damage_from || []).map((x) => `type:${x.name}`),
      resistantTo: (rel.half_damage_from || []).map((x) => `type:${x.name}`),
      notVeryEffectiveAgainst: (rel.half_damage_to || []).map((x) => `type:${x.name}`),
      immuneTo: (rel.no_damage_from || []).map((x) => `type:${x.name}`),
      noEffectAgainst: (rel.no_damage_to || []).map((x) => `type:${x.name}`),
      generation: t.generation ? `gen:${idFromUrl(t.generation.url)}` : null,
    });
  }
  typeItems.sort((a, b) => a.id.localeCompare(b.id));

  // moves
  const moveItems = [];
  for (const m of moveData.values()) {
    const koName = pickKoName(m.names);
    if (!m.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`move:${m.name}`);
    }
    moveItems.push({
      id: `move:${m.name}`,
      enName: m.name,
      koName,
      type: m.type ? `type:${m.type.name}` : null,
      damageClass: m.damage_class?.name || null, // physical / special / status
      power: m.power ?? null,
      accuracy: m.accuracy ?? null,
      pp: m.pp ?? null,
      priority: m.priority ?? null,
      generation: m.generation ? `gen:${idFromUrl(m.generation.url)}` : null,
      koEffect: pickKoEffect(m.effect_entries),
    });
  }
  moveItems.sort((a, b) => a.id.localeCompare(b.id));

  // abilities
  const abilityItems = [];
  for (const a of abilityData.values()) {
    const koName = pickKoName(a.names);
    if (!a.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`ability:${a.name}`);
    }
    const koDesc = pickKoEffect(a.effect_entries) || pickKoFlavor(a.flavor_text_entries)?.text;
    abilityItems.push({
      id: `ability:${a.name}`,
      enName: a.name,
      koName,
      koDescription: koDesc || null,
      isMainSeries: !!a.is_main_series,
      generation: a.generation ? `gen:${idFromUrl(a.generation.url)}` : null,
    });
  }
  abilityItems.sort((a, b) => a.id.localeCompare(b.id));

  // habitats
  const habitatItems = [];
  for (const h of habitatData.values()) {
    const koName = pickKoName(h.names);
    if (!h.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`habitat:${h.name}`);
    }
    habitatItems.push({
      id: `habitat:${h.name}`,
      enName: h.name,
      koName,
    });
  }
  habitatItems.sort((a, b) => a.id.localeCompare(b.id));

  // generations
  const generationItems = [];
  for (const g of generationData.values()) {
    const koName = pickKoName(g.names);
    if (!g.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`gen:${g.id}`);
    }
    const regionKoName = g.main_region?.url ? null : null; // will fill if we fetch regions; otherwise null
    generationItems.push({
      id: `gen:${g.id}`,
      enName: g.name,
      koName,
      regionEnName: g.main_region?.name || null,
      regionKoName, // not fetched separately to avoid extra calls; client can map by enName
    });
  }
  generationItems.sort((a, b) => {
    const an = Number(a.id.split(':')[1]);
    const bn = Number(b.id.split(':')[1]);
    return an - bn;
  });

  // colors
  const colorItems = [];
  for (const c of colorData.values()) {
    const koName = pickKoName(c.names);
    if (!c.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`color:${c.name}`);
    }
    colorItems.push({
      id: `color:${c.name}`,
      enName: c.name,
      koName,
    });
  }
  colorItems.sort((a, b) => a.id.localeCompare(b.id));

  // shapes
  const shapeItems = [];
  for (const s of shapeMap.values()) {
    const koName = pickKoName(s.names);
    if (!s.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`shape:${s.name}`);
    }
    shapeItems.push({
      id: `shape:${s.name}`,
      enName: s.name,
      koName,
    });
  }
  shapeItems.sort((a, b) => a.id.localeCompare(b.id));

  // egg groups
  const eggGroupItems = [];
  for (const e of eggGroupData.values()) {
    const koName = pickKoName(e.names);
    if (!e.names?.some((n) => n.language?.name === 'ko' || n.language?.name === 'ko-Hrkt')) {
      koFallback.push(`egg-group:${e.name}`);
    }
    eggGroupItems.push({
      id: `egg-group:${e.name}`,
      enName: e.name,
      koName,
    });
  }
  eggGroupItems.sort((a, b) => a.id.localeCompare(b.id));

  // evolution chains
  const evolutionItems = [];
  for (const c of chainData.values()) {
    const stages = [];
    flattenChain(c.chain, stages);
    evolutionItems.push({
      id: `evolution:${c.id}`,
      babyTriggerItem: c.baby_trigger_item?.name || null,
      rootSpeciesId: c.chain?.species ? `pokemon:${idFromUrl(c.chain.species.url)}` : null,
      stages,
    });
  }
  evolutionItems.sort((a, b) => {
    const an = Number(a.id.split(':')[1]);
    const bn = Number(b.id.split(':')[1]);
    return an - bn;
  });

  // ---- 6. Write JSON ----------------------------------------------------
  console.log('\n[6/8] JSON 저장 중...');
  function writeJSON(name, payload) {
    const path = join(DATA_DIR, name);
    writeFileSync(path, JSON.stringify(payload));
    const bytes = readFileSync(path).length;
    console.log(`  ${name}: ${(bytes / 1024).toFixed(1)} KB`);
    return bytes;
  }

  const buildSeconds = ((Date.now() - T0) / 1000).toFixed(2);

  const meta = {
    builtAt: new Date().toISOString(),
    builderVersion: '1.0.0',
    source: 'https://pokeapi.co/api/v2/',
    counts: {
      pokemon: pokemonItems.length,
      types: typeItems.length,
      moves: moveItems.length,
      abilities: abilityItems.length,
      habitats: habitatItems.length,
      generations: generationItems.length,
      evolutionChains: evolutionItems.length,
      eggGroups: eggGroupItems.length,
      colors: colorItems.length,
      shapes: shapeItems.length,
    },
    koFallback: [...new Set(koFallback)],
    failed,
    buildSeconds: Number(buildSeconds),
    locale: { primary: 'ko', secondary: 'ko-Hrkt', fallback: 'en' },
  };

  let totalBytes = 0;
  totalBytes += writeJSON('pokemon.json', { items: pokemonItems });
  totalBytes += writeJSON('types.json', { items: typeItems });
  totalBytes += writeJSON('moves.json', { items: moveItems });
  totalBytes += writeJSON('abilities.json', { items: abilityItems });
  totalBytes += writeJSON('habitats.json', { items: habitatItems });
  totalBytes += writeJSON('generations.json', { items: generationItems });
  totalBytes += writeJSON('evolution-chains.json', { items: evolutionItems });
  totalBytes += writeJSON('eggGroups.json', { items: eggGroupItems });
  totalBytes += writeJSON('colors.json', { items: colorItems });
  totalBytes += writeJSON('shapes.json', { items: shapeItems });
  totalBytes += writeJSON('meta.json', meta);

  // ---- 7. Validation ----------------------------------------------------
  console.log('\n[7/8] 검증...');
  const validations = [];
  validations.push({ check: 'pokemon >= 1000', pass: pokemonItems.length >= 1000, value: pokemonItems.length });
  validations.push({ check: 'types == 18', pass: typeItems.length === 18, value: typeItems.length });
  validations.push({ check: 'moves > 800', pass: moveItems.length > 800, value: moveItems.length });
  validations.push({ check: 'abilities > 250', pass: abilityItems.length > 250, value: abilityItems.length });
  validations.push({ check: 'evolutionChains > 400', pass: evolutionItems.length > 400, value: evolutionItems.length });
  validations.push({ check: 'eggGroups > 0', pass: eggGroupItems.length > 0, value: eggGroupItems.length });
  for (const v of validations) {
    console.log(`  ${v.pass ? '[ok]' : '[!!]'} ${v.check}: ${v.value}`);
  }

  const failRate = pokemonItems.length === 0
    ? 0
    : failed.length / Math.max(1, pokemonItems.length + moveItems.length + abilityItems.length);
  if (failRate > 0.05) {
    console.error(`\n[ERROR] 실패율 ${(failRate * 100).toFixed(2)}% > 5%. 빌드 신뢰성 낮음.`);
    process.exitCode = 2;
  }

  // ---- 8. Summary -------------------------------------------------------
  console.log('\n[8/8] 요약');
  console.log(`  pokemon: ${pokemonItems.length}`);
  console.log(`  types: ${typeItems.length}`);
  console.log(`  moves: ${moveItems.length}`);
  console.log(`  abilities: ${abilityItems.length}`);
  console.log(`  evolutionChains: ${evolutionItems.length}`);
  console.log(`  habitats: ${habitatItems.length}`);
  console.log(`  generations: ${generationItems.length}`);
  console.log(`  colors: ${colorItems.length}`);
  console.log(`  shapes: ${shapeItems.length}`);
  console.log(`  eggGroups: ${eggGroupItems.length}`);
  console.log(`  ko 폴백: ${meta.koFallback.length}`);
  console.log(`  실패: ${failed.length}`);
  console.log(`  총 크기: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  빌드 시간: ${buildSeconds}s`);
  console.log('\n완료.');
}

main().catch((e) => {
  console.error('\n[FATAL]', e);
  process.exit(1);
});
