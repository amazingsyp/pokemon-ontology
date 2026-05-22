---
name: pokemon-ontology-mapping
description: 포켓몬 데이터를 RDF 트리플과 OWL 클래스·속성·제약·추론규칙으로 변환하는 매핑 가이드. IRI 네임스페이스 컨벤션, 클래스 계층 설계, 객체/데이터 속성 구분, Turtle 직렬화, 챕터별 그래프 슬라이스 생성에 사용.
---

# 포켓몬 → 온톨로지 매핑

`_workspace/data/`의 평탄한 JSON을 RDF/OWL 온톨로지 모델로 변환한다.

## IRI 네임스페이스 컨벤션

단 하나의 네임스페이스만 사용: `poke:` (학습 단순화).

| 카테고리 | 표기 | 예시 |
|---------|------|------|
| 클래스 | PascalCase | `poke:Pokemon`, `poke:FireType`, `poke:LegendaryPokemon` |
| 객체 속성 | lowerCamelCase | `poke:hasType`, `poke:evolvesTo`, `poke:livesIn` |
| 데이터 속성 | lowerCamelCase | `poke:height`, `poke:weight`, `poke:hp` |
| 인스턴스 | 한국어 슬러그 or dex | `poke:피카츄` or `poke:pokemon-25` |

학습용이므로 챕터에 따라 한국어 슬러그 또는 dex 번호 중 친근한 쪽 사용:
- 챕터 1~4: 한국어 슬러그(`poke:피카츄`) — 가독성 우선
- 챕터 9 이후 (RDF/Turtle 도입): dex 번호(`poke:pokemon-25`) — 표준 형식

## 클래스 계층 설계

```
poke:Pokemon
├── poke:LegendaryPokemon
├── poke:MythicalPokemon
└── (타입 차원의 클래스 - 다중 상속)
    poke:FireTypePokemon ⊂ poke:Pokemon
    poke:WaterTypePokemon ⊂ poke:Pokemon
    ...

poke:Type
├── poke:FireType
├── poke:WaterType
└── ...

poke:Move
├── poke:PhysicalMove
├── poke:SpecialMove
└── poke:StatusMove

poke:Ability
poke:Habitat
poke:Generation
poke:EggGroup
poke:EvolutionTrigger
```

핵심 결정:
- "불꽃타입 포켓몬"은 두 가지로 표현 가능:
  1. **인스턴스 + 속성**: `poke:리자몽 poke:hasType poke:불꽃타입`
  2. **서브클래스**: `poke:리자몽 rdf:type poke:FireTypePokemon`
- 챕터 1~5에서는 (1)만, 챕터 6에서 (2)를 도입하며 "같은 사실을 두 방식으로 표현 가능하다"를 가르침.

## 객체 속성 vs 데이터 속성

**객체 속성 (s, p, o 모두 IRI):**
- `poke:hasType` (도메인 Pokemon, 레인지 Type)
- `poke:evolvesTo` (도메인 Pokemon, 레인지 Pokemon, inverse `poke:evolvesFrom`)
- `poke:hasAbility` (도메인 Pokemon, 레인지 Ability)
- `poke:livesIn` (도메인 Pokemon, 레인지 Habitat)
- `poke:fromGeneration` (도메인 Pokemon, 레인지 Generation)
- `poke:strongAgainst` (도메인 Type, 레인지 Type, symmetric? no)
- `poke:weakAgainst` (도메인 Type, 레인지 Type, inverse `poke:strongAgainst`)

**데이터 속성 (o가 literal):**
- `poke:height` (xsd:decimal, 미터)
- `poke:weight` (xsd:decimal, kg)
- `poke:hp`, `poke:attack`, `poke:defense` (xsd:integer)
- `poke:isLegendary` (xsd:boolean)
- `poke:dexNumber` (xsd:integer)

## 트리플 생성 패턴

```javascript
function pokemonToTriples(p) {
  const id = `poke:pokemon-${p.dexNumber}`;
  const triples = [];

  // 타입 선언
  triples.push([id, 'rdf:type', 'poke:Pokemon']);
  triples.push([id, 'rdfs:label', `"${p.koName}"@ko`]);

  // 타입 (객체 속성)
  for (const t of p.types) {
    triples.push([id, 'poke:hasType', t]);
  }

  // 데이터 속성
  triples.push([id, 'poke:dexNumber', `"${p.dexNumber}"^^xsd:integer`]);
  triples.push([id, 'poke:height', `"${p.height / 10}"^^xsd:decimal`]);
  triples.push([id, 'poke:weight', `"${p.weight / 10}"^^xsd:decimal`]);
  triples.push([id, 'poke:hp', `"${p.stats.hp}"^^xsd:integer`]);
  // ...

  // 진화 (evolution-chains.json 별도 처리에서)

  // 전설 (boolean → 클래스 또는 데이터속성 둘 다)
  if (p.isLegendary) {
    triples.push([id, 'rdf:type', 'poke:LegendaryPokemon']);
    triples.push([id, 'poke:isLegendary', '"true"^^xsd:boolean']);
  }

  return triples;
}
```

## Turtle 직렬화 (챕터 9 학습용)

학습자가 읽기 쉬운 Turtle을 생성:

```turtle
@prefix poke: <http://example.org/poke#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

poke:pokemon-25 a poke:Pokemon ;
    rdfs:label "피카츄"@ko ;
    poke:hasType poke:type-electric ;
    poke:dexNumber "25"^^xsd:integer ;
    poke:height "0.4"^^xsd:decimal ;
    poke:evolvesTo poke:pokemon-26 .
```

학습용 Turtle은 prefix 최소화, 한 인스턴스당 5~10 트리플 정도만 추출하여 챕터에 보여줌 (전체 트리플 수십만 개를 다 보여주지 X).

## 챕터별 그래프 슬라이스 생성

각 챕터의 `newConcepts`를 시각적으로 가장 잘 보여주는 부분 그래프를 만든다.

### Ch02 (클래스와 인스턴스) 슬라이스 예시

```json
{
  "id": "ch02",
  "title": "클래스와 인스턴스",
  "nodes": [
    { "id": "poke:Pokemon", "label": "포켓몬", "type": "class" },
    { "id": "poke:피카츄", "label": "피카츄", "type": "instance" },
    { "id": "poke:라이츄", "label": "라이츄", "type": "instance" },
    { "id": "poke:파이리", "label": "파이리", "type": "instance" }
  ],
  "edges": [
    { "source": "poke:피카츄", "target": "poke:Pokemon", "label": "type", "kind": "is-a" },
    { "source": "poke:라이츄", "target": "poke:Pokemon", "label": "type", "kind": "is-a" },
    { "source": "poke:파이리", "target": "poke:Pokemon", "label": "type", "kind": "is-a" }
  ],
  "highlight": ["poke:Pokemon"],
  "layoutHint": "breadthfirst"
}
```

### 슬라이스 크기 가이드라인

| 챕터 영역 | 노드 수 | 엣지 수 |
|---------|--------|---------|
| 1~4 (기초) | 5~12 | 5~15 |
| 5~9 (중급) | 15~30 | 20~40 |
| 10~13 (고급) | 30~80 | 50~150 |
| 14~15 (응용) | 50~150 | 100~300 |

## 추론 규칙 (챕터 13)

```json
[
  {
    "id": "rule-transitive-evolution",
    "koLabel": "진화의 추이성",
    "if": [["?a", "poke:evolvesTo", "?b"], ["?b", "poke:evolvesTo", "?c"]],
    "then": [["?a", "poke:evolvesToEventually", "?c"]],
    "koExplanation": "A가 B로 진화하고, B가 C로 진화하면, A는 결국 C로 진화한다고 말할 수 있어요."
  },
  {
    "id": "rule-fire-type-pokemon",
    "koLabel": "불꽃타입 포켓몬 자동 분류",
    "if": [["?p", "rdf:type", "poke:Pokemon"], ["?p", "poke:hasType", "poke:type-fire"]],
    "then": [["?p", "rdf:type", "poke:FireTypePokemon"]],
    "koExplanation": "어떤 포켓몬이 불꽃 타입을 가지면, 그 포켓몬은 '불꽃타입 포켓몬' 클래스의 인스턴스예요."
  },
  {
    "id": "rule-inverse-evolution",
    "koLabel": "진화의 역관계",
    "if": [["?a", "poke:evolvesTo", "?b"]],
    "then": [["?b", "poke:evolvesFrom", "?a"]]
  }
]
```

## OWL 표현력 (챕터 12)

OWL 정의 예시를 schema.json에 함께 저장:

```json
{
  "iri": "poke:LegendaryPokemon",
  "koLabel": "전설의 포켓몬",
  "parent": "poke:Pokemon",
  "owlDefinition": "Pokemon ⊓ (isLegendary value true)",
  "koExplanation": "전설의 포켓몬은 '포켓몬'이면서 동시에 'isLegendary가 true인' 개체예요."
}
```

```json
{
  "iri": "poke:DualTypePokemon",
  "koLabel": "듀얼 타입 포켓몬",
  "owlDefinition": "Pokemon ⊓ (hasType min 2 Type)",
  "koExplanation": "타입을 2개 이상 가진 포켓몬이에요."
}
```

학습자에게는 ⊓, ⊑ 같은 수학 기호와 함께 한국어 풀이를 항상 같이 보여준다.
