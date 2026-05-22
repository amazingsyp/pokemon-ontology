---
name: pokemon-data-pipeline
description: PokeAPI에서 전 세대 포켓몬 한국어 데이터를 수집·정규화하여 임베드용 JSON 번들을 만드는 빌드 파이프라인을 작성·수정·실행할 때 사용. fetch-data.js 빌드 스크립트, ko 로케일 추출, 진화체인 정규화, 디스크 캐싱, 동시성/재시도 처리, _workspace/data/ 산출물 생성 작업이 필요할 때 반드시 이 스킬을 호출할 것.
---

# 포켓몬 데이터 파이프라인

PokeAPI(https://pokeapi.co/api/v2/)에서 한국어 포켓몬 데이터를 수집·정규화하여 단일 HTML에 임베드할 JSON 번들을 생성한다.

## 왜 파이프라인인가

PokeAPI는 자원이 분산되어 있다(`/pokemon/{id}`, `/pokemon-species/{id}`, `/evolution-chain/{id}`, `/type/{id}`, ...). 학습용 그래프를 만들려면 이 분산된 자원을 한국어 로케일로 통합한 평탄한 구조가 필요하다. 직접 호출하면 1000+ 포켓몬 × 4~5개 자원 = 수천 번의 HTTP 호출이라 캐싱·재시도·동시성이 필수.

## 빌드 스크립트 구조

`프로젝트/scripts/fetch-data.js` 한 파일에 작성한다. Node.js 18+ 가정(fetch 내장).

### 핵심 단계

1. **종(species) 인덱스 가져오기**: `/pokemon-species?limit=2000` 으로 모든 종 ID 수집
2. **종마다 species + pokemon 자원 병행 fetch**: 한국어 이름·설명·세대·서식지·진화체인은 species에, 종족값·타입·기술·특성은 pokemon에 있음
3. **참조 자원 별도 수집**: `/type/{n}` 18개, `/ability/{n}` 전체, `/evolution-chain/{n}` 등 종에서 참조하는 ID만 수집
4. **한국어 로케일 추출**: 각 응답의 `names[]`, `flavor_text_entries[]`에서 `language.name === 'ko'` 항목 추출. 없으면 `language.name === 'en'` 폴백
5. **정규화 및 출력**: `_workspace/data/*.json` 으로 저장

### 동시성·재시도·캐싱

```javascript
// 동시성 제한 8
const limit = pLimit(8);

// 디스크 캐싱: _workspace/cache/{url-hash}.json
async function cachedFetch(url) {
  const cacheKey = sha1(url);
  const cachePath = `_workspace/cache/${cacheKey}.json`;
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath));
  const res = await retryFetch(url, { retries: 3, backoff: 'exponential' });
  writeFileSync(cachePath, JSON.stringify(res));
  return res;
}

// 진행률 표시
let done = 0;
for (const species of allSpecies) {
  await limit(async () => {
    const data = await fetchSpeciesBundle(species.id);
    process.stdout.write(`\r수집 진행: ${++done}/${allSpecies.length}`);
  });
}
```

### 한국어 로케일 추출 헬퍼

```javascript
function pickKoName(names) {
  // names: [{ name, language: { name } }]
  return names.find(n => n.language.name === 'ko')?.name
      || names.find(n => n.language.name === 'ko-Hrkt')?.name
      || names.find(n => n.language.name === 'en')?.name
      || null;
}

function pickKoFlavor(flavorTextEntries) {
  const ko = flavorTextEntries.find(e => e.language.name === 'ko');
  // PokeAPI flavor text는 줄바꿈/특수문자가 섞임. 정제 필요.
  return ko ? ko.flavor_text.replace(/\f|\n|\r/g, ' ').replace(/\s+/g, ' ').trim() : null;
}
```

## 출력 JSON 스키마

### pokemon.json

```json
{
  "items": [
    {
      "id": "pokemon:25",
      "dexNumber": 25,
      "koName": "피카츄",
      "enName": "pikachu",
      "types": ["type:electric"],
      "generation": "gen:1",
      "stats": { "hp": 35, "atk": 55, "def": 40, "spAtk": 50, "spDef": 50, "speed": 90 },
      "height": 4,
      "weight": 60,
      "abilities": ["ability:static", "ability:lightning-rod"],
      "habitat": "habitat:forest",
      "color": "color:yellow",
      "shape": "shape:quadruped",
      "isLegendary": false,
      "isMythical": false,
      "evolutionChainId": "evolution:10",
      "eggGroups": ["egg-group:ground", "egg-group:fairy"],
      "moves": ["move:thunderbolt", "move:quick-attack", "..."],
      "koFlavor": "한국어 도감 설명..."
    }
  ]
}
```

### types.json

```json
{
  "items": [
    {
      "id": "type:fire",
      "koName": "불꽃",
      "weakAgainst": ["type:water", "type:rock", "type:ground"],
      "strongAgainst": ["type:grass", "type:ice", "type:bug", "type:steel"],
      "immuneTo": []
    }
  ]
}
```

### evolution-chains.json

PokeAPI의 chain 트리(`baby_trigger_item`, `evolves_to[]` 재귀)를 평탄한 엣지 배열로 변환:

```json
{
  "items": [
    {
      "id": "evolution:10",
      "stages": [
        { "from": "pokemon:172", "to": "pokemon:25", "trigger": "high-friendship", "koTrigger": "친밀도 상승" },
        { "from": "pokemon:25", "to": "pokemon:26", "trigger": "use-item", "item": "thunder-stone", "koTrigger": "천둥의돌 사용" }
      ]
    }
  ]
}
```

## 실행 방법

```bash
node scripts/fetch-data.js
# 또는 캐시 무시
node scripts/fetch-data.js --no-cache
# 또는 실패한 항목만 재시도
node scripts/fetch-data.js --retry-failed
```

## 데이터 크기 관리

전 세대 1000+ 포켓몬, 풍부한 속성 포함 시 총 JSON 합계가 30~50MB까지 갈 수 있다. 다음 전략으로 크기를 줄인다:

- `koFlavor`는 가장 최근 게임 버전 하나만 (`version: { name: 'sword' }` 우선)
- `moves[]`는 ID 배열만 (이름은 moves.json에서 조회)
- 학습에 불필요한 필드(스프라이트 URL, 게임 인덱스 등)는 제외
- 빌드 시 `JSON.stringify(data)` (들여쓰기 없음)로 저장 — 인간 가독성 X, 임베드용

## 에러 케이스 처리

- 한국어 누락: meta.json.koFallback[] 에 ID 기록, 영어로 폴백
- 진화 트리거가 ko로 번역 안 됨: trigger 영어 + koTrigger 수동 매핑 테이블 (small)
- 일부 종은 species는 있지만 pokemon이 없음 (예: 폼이 분리된 경우): skip하고 meta.failed[] 기록

## 검증 단계 (스크립트 끝에서 수행)

```javascript
console.log(`✓ pokemon: ${pokemon.items.length}`);
console.log(`✓ types: ${types.items.length} (expected 18)`);
console.log(`✓ ko 누락 폴백: ${meta.koFallback.length}`);
console.log(`✓ 실패: ${meta.failed.length}`);
if (pokemon.items.length < 1000) {
  console.warn('⚠ 포켓몬 수가 1000 미만입니다. 전 세대 요구사항 확인.');
}
```
