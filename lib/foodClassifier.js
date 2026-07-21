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

// 과일·식품과 동일하게 "성분/품목" 단위로 탭이 나뉘도록 — '관절·연골'/'한방 보양'/'기타 단일성분' 같은
// 큰 묶음 대신 콘드로이친/MBP/NEM/흑염소/녹용 등 실제 성분마다 항목을 둔다. 유산균·오메가3·눈건강(루테인
// 지아잔틴아스타잔틴은 늘 같이 팔림)·비타민·콜라겐은 원래도 성분 하나짜리라 그대로 둠. 비타민K2처럼
// 더 구체적인 항목은 일반 "비타민" 규칙보다 위에 둬서 먼저 매칭되게 했다.
const SUPPLEMENT_DEFS = [
  { key: 'probiotics', label: '유산균 · 프로바이오틱스', re: /유산균|프로바이오틱스|BNR17|덴티백|당큐락|메노락토|테라바이오틱스|오라틱스/ },
  { key: 'omega3', label: '오메가3', re: /오메가/ },
  { key: 'chondroitin', label: '콘드로이친', re: /콘드로이친/ },
  { key: 'mbp', label: 'MBP', re: /MBP|엠비피/ },
  { key: 'nem', label: 'NEM', re: /NEM|엔이엠/ },
  { key: 'anapalactin', label: '아나파랙틴', re: /아나파랙틴/ },
  { key: 'eye', label: '루테인 · 지아잔틴 · 아스타잔틴', re: /루테인|지아잔틴|아스타잔틴|아스타루지/ },
  { key: 'vitaminK2', label: '비타민K2', re: /비타민\s*K2/ },
  { key: 'vitamin', label: '비타민', re: /비타민(?!나무)/ },
  { key: 'collagen', label: '먹는 콜라겐', re: /콜라겐|레티놀A/ },
  { key: 'magnesium', label: '마그네슘', re: /마그네슘/ },
  { key: 'cissus', label: '시서스', re: /시서스/ },
  { key: 'acv', label: '애사비', re: /애사비/ },
  { key: 'grainburning', label: '그레인 버닝', re: /그레인 ?버닝/ },
  { key: 'diet_etc', label: '기타 다이어트', re: /다이어트/ },
  { key: 'blackgoat', label: '흑염소', re: /흑염소/ },
  { key: 'deerantler', label: '녹용', re: /녹용/ },
  { key: 'maekmundong', label: '맥문동', re: /맥문동/ },
  { key: 'ginger', label: '생강진액', re: /생강진액/ },
  { key: 'balloonflower', label: '도라지즙 · 청', re: /도라지즙|도라지청/ },
  { key: 'gongjindan', label: '공진단', re: /공진단/ },
  { key: 'nmn', label: 'NMN', re: /NMN/ },
  { key: 'glutathione', label: '글루타치온', re: /글루타치온/ },
  { key: 'protein', label: '프로틴', re: /프로틴|하이뮨/ },
  { key: 'arginine', label: '아르기닌', re: /아르기닌/ },
  { key: 'ps', label: '포스파티딜세린', re: /포스파티딜세린|두뇌엔\s*(?:닥터\s*)?PS(?:\s*맥스)?/ },
  { key: 'psyllium', label: '차전자피', re: /차전자피/ },
  { key: 'coq10', label: '코큐텐', re: /코큐텐|코엔자임/ },
  { key: 'milkthistle', label: '밀크씨슬', re: /밀크씨슬/ },
  { key: 'policosanol', label: '폴리코사놀', re: /폴리코사놀/ },
  { key: 'albumin', label: '백세알부민', re: /알부민/ },
  { key: 'kale', label: '컬리케일', re: /컬리케일/ },
  { key: 'propolis', label: '프로폴리스 · 로열젤리', re: /프로폴리스|로열젤리/ },
  { key: 'chlorella', label: '클로렐라', re: /클로렐라/ },
  { key: 'height', label: '키성장', re: /키성장/ },
];

// 과일처럼 "품목" 단위로 탭이 나뉘도록 — '수산물'/'축산물' 같은 큰 묶음 대신
// 고등어/갈치/오징어/한우/한돈 등 실제 낱개 품목마다 항목을 둔다. 위에서부터 먼저 매칭되는 걸
// 쓰므로, 더 구체적인 요리명(갈비탕 등)을 원재료명(한우 등)보다 위에 둬서 우선 매칭되게 했다.
const FOOD_DEFS = [
  // 수산물
  { key: 'squid', label: '오징어', re: /오징어/ },
  { key: 'abalone', label: '전복', re: /전복/ },
  { key: 'mackerel', label: '고등어', re: /고등어/ },
  { key: 'hairtail', label: '갈치', re: /갈치/ },
  { key: 'gulbi', label: '굴비', re: /굴비/ },
  { key: 'octopus_small', label: '낙지', re: /낙지/ },
  { key: 'octopus', label: '문어', re: /문어/ },
  { key: 'shrimp', label: '새우', re: /새우(?!젓)/ },
  { key: 'pollock_roe', label: '명란', re: /명란/ },
  { key: 'crab', label: '꽃게', re: /꽃게/ },
  { key: 'clam', label: '조개', re: /조개/ },
  { key: 'eel', label: '장어', re: /장어/ },
  { key: 'plaice', label: '가자미 · 간재미', re: /가자미|간재미/ },
  { key: 'pollock_dried', label: '황태', re: /황태/ },
  { key: 'whelk', label: '골뱅이', re: /골뱅이/ },
  { key: 'anchovy', label: '멸치', re: /멸치(?!액젓)/ },
  { key: 'codfish', label: '대구', re: /대구(?!\s*(유명|돼지))/ },
  { key: 'octopus_baby', label: '주꾸미', re: /주꾸미/ },
  { key: 'natto', label: '낫또', re: /낫또/ },
  // 축산물 — 구체적 요리명을 원재료명보다 먼저 체크
  { key: 'galbitang', label: '갈비탕', re: /갈비탕/ },
  { key: 'samgyetang', label: '삼계탕', re: /삼계탕/ },
  { key: 'gomtang', label: '곰탕', re: /곰탕/ },
  { key: 'yukgaejang', label: '육개장', re: /육개장/ },
  { key: 'chueotang', label: '추어탕', re: /추어탕/ },
  { key: 'haejangguk', label: '해장국', re: /해장국/ },
  { key: 'naengmyeon', label: '냉면', re: /냉면/ },
  { key: 'yeomsotang', label: '염소탕', re: /염소탕/ },
  { key: 'dogani', label: '도가니탕', re: /도가니/ },
  { key: 'baeksuk', label: '백숙', re: /백숙/ },
  { key: 'smoked_duck', label: '훈제오리', re: /훈제오리/ },
  { key: 'dakgalbi', label: '닭갈비', re: /닭갈비/ },
  { key: 'jokbal', label: '족발 · 보쌈', re: /족발|보쌈/ },
  { key: 'hamburg', label: '함박스테이크', re: /함박스테이크/ },
  { key: 'donkatsu', label: '돈까스', re: /돈까스/ },
  { key: 'bulgogi', label: '불고기', re: /불고기/ },
  { key: 'usamgyeop', label: '우삼겹', re: /우삼겹/ },
  { key: 'moksal', label: '목살', re: /목살/ },
  { key: 'samgyeopsal', label: '삼겹살', re: /삼겹살/ },
  { key: 'hanu', label: '한우', re: /한우/ },
  { key: 'handon', label: '한돈', re: /한돈/ },
  // 쌀 · 잡곡
  { key: 'rice', label: '쌀', re: /(?<!찰)쌀(?![겨통])/ },
  { key: 'brown_rice', label: '현미', re: /현미/ },
  { key: 'barley', label: '찰보리', re: /찰보리/ },
  { key: 'oat', label: '귀리', re: /귀리/ },
  { key: 'corn', label: '찰옥수수', re: /찰옥수수/ },
  { key: 'chili_powder', label: '고춧가루', re: /고춧가루/ },
  { key: 'potato', label: '감자', re: /감자(?!탕)/ },
  { key: 'onion', label: '양파', re: /양파/ },
  // 김치 · 젓갈 · 장아찌 (깍두기/오이소박이/겉절이/묵은지는 다 김치의 한 종류라 같은 항목으로 묶음)
  { key: 'kimchi', label: '김치', re: /김치|깍두기|오이소박이|겉절이|묵은지/ },
  { key: 'saeujeot', label: '새우젓', re: /새우젓/ },
  { key: 'hwangseokeojeot', label: '황석어젓', re: /황석어젓/ },
  { key: 'myeolchijeot', label: '멸치액젓', re: /멸치액젓/ },
  { key: 'jeotgal_etc', label: '기타 젓갈', re: /젓갈/ },
  { key: 'jangajji', label: '장아찌', re: /장아찌/ },
  // 유제품 · 음료
  { key: 'soymilk', label: '두유', re: /두유/ },
  { key: 'juice', label: '주스', re: /주스|쥬스/ },
  { key: 'yogurt', label: '요거트', re: /요거트/ },
  // 기타 가공식품
  { key: 'noodle', label: '막국수 · 메밀면', re: /막국수|메밀면/ },
  { key: 'mandu', label: '만두', re: /만두/ },
  { key: 'tteok', label: '떡', re: /떡/ },
  { key: 'sesame_oil', label: '참기름', re: /참기름/ },
  { key: 'jeonbyeong', label: '전병', re: /전병/ },
  { key: 'granola', label: '그래놀라', re: /그래놀라/ },
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
