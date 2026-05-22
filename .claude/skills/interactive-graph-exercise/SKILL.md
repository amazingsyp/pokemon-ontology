---
name: interactive-graph-exercise
description: 챕터별 인터랙티브 실습(그래프 빌드·드래그앤드롭 분류·트리플 빌더·매칭·쿼리 빌더·추론 시뮬레이션·퀴즈) 설계 패턴과 정답 검증 로직 작성 가이드. exercise JSON 스키마, 힌트 시스템, 부분 점수, 검증 함수 명세 작성 시 사용.
---

# 인터랙티브 실습 설계

학습자가 "직접 해보고 정답을 만들어내는" 액티브 러닝 실습을 설계한다.

## 실습 유형 7종

### 1. graph-build (그래프 빌드)

빈 캔버스 또는 부분 그래프에 학습자가 노드/엣지를 추가하여 정답 구조를 완성.

```json
{
  "type": "graph-build",
  "title": "피카츄의 진화 체인을 그려보세요",
  "init": {
    "givenNodes": [
      { "id": "n1", "label": "피츄", "type": "instance" },
      { "id": "n2", "label": "피카츄", "type": "instance" },
      { "id": "n3", "label": "라이츄", "type": "instance" }
    ],
    "givenEdges": [],
    "palette": {
      "edges": [{ "label": "진화함", "kind": "object" }, { "label": "타입을_가짐", "kind": "object" }]
    }
  },
  "validation": {
    "kind": "graph-isomorphism",
    "expectedEdges": [
      { "from": "피츄", "to": "피카츄", "label": "진화함" },
      { "from": "피카츄", "to": "라이츄", "label": "진화함" }
    ]
  },
  "hints": [
    "진화 순서를 기억해 보세요.",
    "피츄 → 피카츄 → 라이츄 순서로 진화합니다.",
    "두 개의 엣지가 필요해요."
  ]
}
```

### 2. drag-classify (드래그앤드롭 분류)

포켓몬 카드를 올바른 클래스 박스로 끌어놓기.

```json
{
  "type": "drag-classify",
  "title": "각 포켓몬을 올바른 타입 박스에 넣으세요",
  "init": {
    "items": [
      { "id": "피카츄", "label": "피카츄" },
      { "id": "리자몽", "label": "리자몽" },
      { "id": "어니부기", "label": "어니부기" }
    ],
    "buckets": [
      { "id": "전기", "label": "전기 타입" },
      { "id": "불꽃", "label": "불꽃 타입" },
      { "id": "물", "label": "물 타입" }
    ]
  },
  "validation": {
    "kind": "bucket-assignment",
    "expected": {
      "피카츄": ["전기"],
      "리자몽": ["불꽃", "비행"],
      "어니부기": ["물"]
    },
    "partialCredit": true
  }
}
```

### 3. triple-build (트리플 빌더)

3개 드롭다운(주어/술어/목적어)으로 트리플 만들기.

```json
{
  "type": "triple-build",
  "title": "다음 사실을 트리플로 표현하세요: '피카츄는 전기 타입이다'",
  "init": {
    "subjects": ["피카츄", "라이츄", "전기", "타입"],
    "predicates": ["타입을_가짐", "진화함", "ako"],
    "objects": ["전기", "피카츄", "포켓몬"]
  },
  "validation": {
    "kind": "exact-match",
    "expected": ["피카츄", "타입을_가짐", "전기"]
  }
}
```

### 4. matching (매칭)

두 컬럼을 짝짓기. 선 긋기 또는 드롭다운.

```json
{
  "type": "matching",
  "title": "각 포켓몬과 서식지를 짝지으세요",
  "init": {
    "left": ["고라파덕", "이상해씨", "메타몽"],
    "right": ["연못", "초원", "동굴"]
  },
  "validation": {
    "kind": "matching-pairs",
    "expected": { "고라파덕": "연못", "이상해씨": "초원", "메타몽": "동굴" }
  }
}
```

### 5. query-build (쿼리 빌더)

자연어 질문 → 비주얼 SPARQL 빌더로 작성.

```json
{
  "type": "query-build",
  "title": "'모든 불꽃 타입 포켓몬 찾기' 쿼리를 만들어보세요",
  "init": {
    "queryShape": "SELECT ?p WHERE { ?p ?prop ?obj }",
    "options": {
      "?prop": ["poke:hasType", "poke:evolvesTo", "rdf:type"],
      "?obj": ["poke:type-fire", "poke:Pokemon", "poke:type-water"]
    }
  },
  "validation": {
    "kind": "query-match",
    "expected": { "?prop": "poke:hasType", "?obj": "poke:type-fire" }
  }
}
```

### 6. reasoning-sim (추론 시뮬레이션)

명시 트리플과 규칙이 주어졌을 때 도출 트리플을 예측.

```json
{
  "type": "reasoning-sim",
  "title": "다음 규칙을 적용하면 어떤 트리플이 새로 도출될까요?",
  "init": {
    "givenTriples": [
      ["피츄", "진화함", "피카츄"],
      ["피카츄", "진화함", "라이츄"]
    ],
    "rule": {
      "if": [["?a", "진화함", "?b"], ["?b", "진화함", "?c"]],
      "then": [["?a", "결국_진화함", "?c"]]
    },
    "candidateAnswers": [
      ["피츄", "결국_진화함", "라이츄"],
      ["피카츄", "결국_진화함", "피카츄"],
      ["라이츄", "결국_진화함", "피츄"]
    ]
  },
  "validation": {
    "kind": "select-correct",
    "correct": [0]
  }
}
```

### 7. quiz (객관식·단답)

보조 확인용. 챕터당 1~2개만 사용.

## 정답 검증 종류 (validation.kind)

| kind | 설명 | 사용 시점 |
|------|------|----------|
| `exact-match` | 배열·객체 깊은 일치 | 트리플 빌더, 단일 정답 |
| `set-match` | 순서 무관 집합 일치 | 여러 트리플 동시 입력 |
| `subset-match` | 정답의 부분집합이면 통과 | 부분 점수 가능한 그래프 빌드 |
| `bucket-assignment` | 항목→버킷 매핑 검증 | 드래그 분류 |
| `matching-pairs` | 키-값 쌍 일치 | 매칭 |
| `graph-isomorphism` | 그래프 구조 동형 | 그래프 빌드 (노드 ID 무관) |
| `query-match` | 쿼리 변수 바인딩 일치 | SPARQL 빌더 |
| `select-correct` | 선택지 인덱스 일치 | 추론 시뮬레이션 객관식 |
| `function:{name}` | 커스텀 함수 호출 | 복잡한 정답 검증 |

## 힌트 시스템

각 실습은 3단계 힌트:
1. **방향 제시**: "어떤 종류의 관계를 떠올려보세요"
2. **개념 환기**: "직전 챕터에서 본 '진화함' 속성을 다시 보세요"
3. **거의 답**: "피츄가 진화하면 무엇이 되나요?"

마지막 힌트는 정답 직전. "정답을 보여주세요" 버튼은 별도(학습 포기 후).

## 즉시 피드백 패턴

```javascript
// 사용자가 답을 제출하면
const result = validate(userAnswer, exercise.validation);
if (result.correct) {
  showSuccess(exercise.successMessage);
  unlockNextExercise();
  saveProgress();
} else if (result.partial) {
  showPartial(`${result.score}/${result.total} 맞췄어요! 나머지를 더 시도해보세요.`);
  highlightIncorrect(result.incorrectItems);
} else {
  showIncorrect();
  offerHint();
}
```

## 부분 점수 (partial credit)

`graph-build`, `drag-classify`, `set-match`는 부분 점수 가능. 학습자가 100% 정답이 아니어도 진척감을 느끼도록.

## 챕터당 실습 구성

3~5개 실습. 첫 1~2개는 매우 쉽게(워밍업), 마지막은 챕터의 핵심 개념을 종합 적용하는 도전 과제.

```
실습 1: quiz (개념 확인, 1분)
실습 2: drag-classify (단순 적용, 3분)
실습 3: triple-build 또는 graph-build (중심 활동, 5~7분)
실습 4 (옵션): reasoning-sim 또는 query-build (응용, 7~10분)
```

## 정답 데이터 출처

실습 정답은 항상 `_workspace/ontology/triples.json` 또는 `inference-rules.json`을 기반으로 한다. 직접 손으로 적은 정답은 데이터와 불일치 가능 — QA에서 잡힘.
