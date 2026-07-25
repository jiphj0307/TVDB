// tvdb_program_episodes.content 텍스트를 보고 병명/증상 카테고리로 분류하는 로직.
// foodClassifier.js와 달리 회차 하나가 여러 병명을 동시에 다루는 경우가 흔해서
// (예: "당뇨와 비만을 함께 극복하고..." / "관절염...동맥경화, 암, 고혈압, 당뇨는 물론
// 뇌 손상에도...") 첫 매치 하나만 고르지 않고 매치되는 카테고리를 전부 배열로 반환한다.
// 2026-07-25 tvdb_program_episodes 8,989건 샘플을 훑어서 실제로 반복 등장하는
// 병명/증상 위주로 카테고리를 잡음 — 새 회차가 계속 미분류로 새면 이 파일에 키워드를 추가하면 된다.
//
// 실제 DB 백필은 이 파일과 동일한 패턴의 정규식을 SQL로 옮겨 Postgres 쪽에서 한 번에 돌렸다
// (9천 건을 매번 브라우저/스크립트로 훑는 대신 DB에 disease_tags 컬럼으로 미리 저장).
// 새 회차를 수집할 때(주로 curl 기반 스크립트로 직접 INSERT) 이 classifyDisease()를 그대로
// 불러써서 disease_tags를 같이 채우거나, 나중에 disease_tags IS NULL인 행만 골라 동일 SQL
// 패턴으로 다시 백필하면 된다.

// 순서는 중요하지 않다 — 각 카테고리를 독립적으로 테스트해서 매치되는 것을 전부 모은다.
export const DISEASE_DEFS = [
  { key: 'diabetes', label: '당뇨·혈당', re: /당뇨|혈당/ },
  { key: 'vascular', label: '고혈압·혈관질환', re: /고혈압|혈관|동맥경화|혈전|뇌졸중|콜레스테롤|중풍/ },
  { key: 'joint', label: '관절·연골', re: /관절염|관절|연골|류마티스/ },
  { key: 'bone', label: '뼈·골다공증', re: /골다공증|뼈\s?건강|뼈\s?도둑|골절|뼈\s?나이/ },
  { key: 'muscle', label: '근육·근감소증', re: /근감소증|근육|생존근육/ },
  { key: 'heart', label: '심장질환', re: /심장|심근경색|부정맥|협심증/ },
  { key: 'liver', label: '간질환', re: /간경화|간염|지방간|간\s?건강|알부민/ },
  { key: 'kidney', label: '신장·콩팥', re: /신장|콩팥|투석/ },
  { key: 'gut', label: '장·소화기', re: /장\s?건강|장누수|장독소|변비|설사|소화|위장|위염|장염/ },
  { key: 'cancer', label: '암', re: /암/ },
  { key: 'obesity', label: '비만·다이어트', re: /비만|다이어트|체중\s?감량|나잇살|뱃살/ },
  { key: 'eye', label: '눈건강', re: /눈\s?건강|백내장|녹내장|황반|실명|시력/ },
  { key: 'skin', label: '피부·노화', re: /피부|아토피|건선|기미|주름|탄력/ },
  { key: 'dementia', label: '치매·뇌건강', re: /치매|뇌\s?건강|기억력|인지/ },
  { key: 'menopause', label: '갱년기·호르몬', re: /갱년기|폐경|여성\s?호르몬/ },
  { key: 'sleep', label: '수면장애', re: /불면|수면\s?장애|숙면/ },
  { key: 'immune', label: '면역력', re: /면역/ },
  { key: 'inflammation', label: '염증', re: /염증/ },
  { key: 'thyroid', label: '갑상선', re: /갑상선/ },
  { key: 'hairloss', label: '탈모', re: /탈모/ },
  { key: 'pain', label: '통증·디스크', re: /디스크|저림|통증/ },
  { key: 'ear', label: '이명·귀건강', re: /이명|귀\s?건강|난청/ },
  { key: 'oral', label: '구강건강', re: /잇몸|구강|치아|충치/ },
  { key: 'mental', label: '스트레스·정신건강', re: /스트레스|우울|불안/ },
  { key: 'lung', label: '폐·호흡기', re: /폐암|폐\s?건강|천식|기관지|비염|호흡기/ },
  { key: 'edema', label: '부종', re: /부종/ },
  { key: 'gout', label: '통풍', re: /통풍/ },
  { key: 'prostate', label: '전립선·남성건강', re: /전립선|전립샘/ },
];

export const OTHER_LABEL = '기타';

export function classifyDisease(content) {
  const text = (content || '').trim();
  if (!text) return [];
  const tags = [];
  for (const d of DISEASE_DEFS) {
    if (d.re.test(text)) tags.push(d.label);
  }
  return tags;
}
