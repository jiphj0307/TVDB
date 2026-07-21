// 각 광고 슬롯이 어떤 쿠팡 배너 사이즈와 맞는지 매핑 (프레시시즌과 동일한 방식)
// 페이지가 늘어나면 여기에 슬롯만 추가하면 됨
export const SLOT_BANNER_SIZE = {
  home_top: '728x90',
  home_bottom: '728x90',
  home_left: '160x600',
  home_right: '160x600',
  food_top: '728x90',
  food_bottom: '728x90',
  food_left: '160x600',
  food_right: '160x600',
}

// 관리자 패널 기본 슬롯 목록 (tvdb_settings의 ad_slots가 비어있을 때 초기값으로 사용)
export const DEFAULT_AD_SLOTS = [
  { id: 'home_top', name: '홈 상단', w: 728, h: 90, active: false, code: '', source: 'adsense' },
  { id: 'home_bottom', name: '홈 하단', w: 728, h: 90, active: false, code: '', source: 'adsense' },
  { id: 'home_left', name: '홈 좌측 사이드', w: 160, h: 600, active: false, code: '', source: 'adsense' },
  { id: 'home_right', name: '홈 우측 사이드', w: 160, h: 600, active: false, code: '', source: 'adsense' },
  { id: 'food_top', name: '과일·건기식·식품 상단', w: 728, h: 90, active: false, code: '', source: 'adsense' },
  { id: 'food_bottom', name: '과일·건기식·식품 하단', w: 728, h: 90, active: false, code: '', source: 'adsense' },
  { id: 'food_left', name: '과일·건기식·식품 좌측 사이드', w: 160, h: 600, active: false, code: '', source: 'adsense' },
  { id: 'food_right', name: '과일·건기식·식품 우측 사이드', w: 160, h: 600, active: false, code: '', source: 'adsense' },
]
