// tvdb_shopping.product_name 텍스트를 보고 과일/건기식/식품으로 재분류하는 로직.
// 기존 category 컬럼은 채널별 소스가 들쭉날쭉하고(8개 채널은 규칙기반 추정) 신뢰도가 낮아서
// 이 파일은 그 컬럼을 쓰지 않고 product_name만 다시 훑어서 분류한다.
// 2026-07-22 tvdb_shopping 7/12~7/21 데이터로 검증한 키워드셋 — 새 상품 패턴이 계속 나오므로
// 화면에서 "미분류"로 새는 상품이 늘면 이 파일의 키워드를 추가하면 된다.

// 신선 과일 판매글엔 절대 안 나오는 단어들 — 두유(예: "흑임자두유"에 "자두"가 우연히 들어있음),
// 화장품(크림/로션/탄력 등), 즙·주스·장아찌 가공품은 과일 판정 전에 먼저 걸러낸다.
const FRUIT_EXCLUDE_RE =
  /두유|크림|로션|탄력|에센스|앰플|세럼|토너|마스크|워시|주스|쥬스|잼|장아찌|콜라겐|젤리|화장품/;

const FRUIT_DEFS = [
  { key: 'peach', label: '복숭아', re: /복숭아|(백도|황도)(?!라지)/ },
  { key: 'plum', label: '자두', re: /자두/ },
  { key: 'melon_korean', label: '참외', re: /참외/ },
  { key: 'watermelon', label: '수박', re: /수박/ },
  { key: 'citrus', label: '감귤', re: /하우스감귤|귤로장생/ },
  { key: 'mango', label: '망고', re: /망고/ },
  { key: 'cherry', label: '체리', re: /생체리/ },
];

// 시/군 단위까지 알 수 있는 경우 -> 상위 도(province)로 귀속시켜서 "경북"으로 한데 묶는다.
const CITY_DEFS = [
  ['의성', '경북'], ['영천', '경북'], ['상주', '경북'], ['성주', '경북'], ['안동', '경북'],
  ['논산', '충남'],
  ['해남', '전남'], ['나주', '전남'], ['완도', '전남'], ['영광', '전남'], ['진도', '전남'], ['곡성', '전남'], ['순천', '전남'],
  ['고창', '전북'],
  ['여주', '경기'],
  ['워싱턴', '미국 (수입)'],
];

// 도 단위까지만 나오거나 수입산인 경우
const PROVINCE_DEFS = [
  ['제주', '제주'], ['태국', '태국 (수입)'], ['미국', '미국 (수입)'],
  ['경북', '경북'], ['경남', '경남'], ['전남', '전남'], ['전북', '전북'],
  ['충남', '충남'], ['충북', '충북'], ['강원', '강원'],
];

// 과일 상품명에서 도(province)와 시/군(city)을 추출. 시/군을 못 찾으면 city는 null(도 단위로만 묶임).
function extractRegion(name) {
  for (const [kw, province] of CITY_DEFS) {
    if (name.includes(kw)) return { province, city: kw };
  }
  for (const [kw, province] of PROVINCE_DEFS) {
    if (name.includes(kw)) return { province, city: null };
  }
  return { province: '지역 미상', city: null };
}

// 콜라겐/비타민/석류 등 건기식 성분명이 들어간 화장품·잡화는 건기식이 아니라 제외 대상
const SUPPLEMENT_EXCLUDE_RE =
  /마스크팩|앰플|세럼|크림|로션|토너|클렌저|클렌징폼|워시|립타투|아이크림|스킨(?!케어)|에멀전|팩트|틴트|파운데이션|마스카라|립스틱|미스트|바디워시|선크림|리프팅|랩핑|목걸이|팔찌|반지|귀걸이|김치통|샴푸|트리트먼트|고데기|넥마스크/;

const SUPPLEMENT_DEFS = [
  { key: 'probiotics', label: '유산균 · 프로바이오틱스', re: /유산균|프로바이오틱스|BNR17|덴티백|당큐락|메노락토|테라바이오틱스|오라틱스/ },
  { key: 'omega3', label: '오메가3', re: /오메가3|오메가 ?3/ },
  { key: 'joint', label: '관절 · 연골', re: /콘드로이친|아나파랙틴|NEM|엔이엠|MBP|엠비피/ },
  { key: 'eye', label: '눈건강 (루테인)', re: /루테인|지아잔틴|아스타잔틴|아스타루지/ },
  { key: 'vitamin', label: '비타민', re: /비타민(?!나무)/ },
  { key: 'collagen', label: '먹는 콜라겐', re: /콜라겐|레티놀A/ },
  { key: 'diet', label: '다이어트', re: /다이어트|시서스|애사비|비에날씬|그레인 ?버닝/ },
  { key: 'herbal', label: '한방 보양 (진액 · 즙)', re: /흑염소|녹용|맥문동|생강진액|도라지즙|도라지청|공진단|인생 ?마그네슘|두뇌엔 ?PS/ },
  { key: 'antiaging', label: 'NMN · 항노화', re: /NMN|글루타치온/ },
  { key: 'protein', label: '단백질 (프로틴)', re: /프로틴|하이뮨|아르기닌.*(단백질|젤리)/ },
  { key: 'etc_supplement', label: '기타 단일성분', re: /포스파티딜세린|차전자피|코큐텐|코엔자임|밀크씨슬|폴리코사놀|알부민|컬리케일|프로폴리스|로열젤리|클로렐라|비타민K2|키성장|잇몸유산균/ },
];

const FOOD_DEFS = [
  { key: 'seafood', label: '수산물', re: /오징어|전복|고등어|갈치|굴비|낙지|문어|새우(?!젓)|명란|꽃게|조개|장어|가자미|간재미|황태|골뱅이|멸치|대구|주꾸미/ },
  { key: 'meat', label: '축산물', re: /한우|한돈|삼계탕|갈비탕|곰탕|육개장|훈제오리|목살|우삼겹|백숙|염소탕|도가니|삼겹살|불고기|닭갈비|족발|보쌈|추어탕|함박스테이크|돈까스/ },
  { key: 'grain', label: '쌀 · 잡곡', re: /(?<!찰)쌀(?![겨통])|현미|찰보리|귀리|찰옥수수|고춧가루/ },
  { key: 'kimchi', label: '김치 · 젓갈 · 장아찌', re: /김치|젓갈|장아찌|새우젓|명란|황석어젓|멸치액젓/ },
  { key: 'dairy_drink', label: '유제품 · 음료', re: /두유|주스|요거트/ },
  { key: 'etc_food', label: '기타 가공식품', re: /막국수|메밀면|전병|떡|빵|참기름|만두|그래놀라/ },
];

export function classifyProduct(rawName) {
  const name = (rawName || '').trim();
  if (!name) return null;

  if (!FRUIT_EXCLUDE_RE.test(name)) {
    for (const f of FRUIT_DEFS) {
      if (f.re.test(name)) {
        const { province, city } = extractRegion(name);
        return { top: 'fruit', topLabel: '과일', sub: f.label, province, city };
      }
    }
  }

  if (!SUPPLEMENT_EXCLUDE_RE.test(name)) {
    for (const s of SUPPLEMENT_DEFS) {
      if (s.re.test(name)) {
        return { top: 'supplement', topLabel: '건기식', sub: s.label };
      }
    }
  }

  for (const fd of FOOD_DEFS) {
    if (fd.re.test(name)) {
      return { top: 'food', topLabel: '식품', sub: fd.label };
    }
  }

  return null;
}

export const TOP_ORDER = [
  { key: 'fruit', label: '🍑 과일' },
  { key: 'supplement', label: '💊 건기식' },
  { key: 'food', label: '🍚 식품' },
];
