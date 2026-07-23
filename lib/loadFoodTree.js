
// lib/supabase.js(서비스키)는 SUPABASE_URL/SUPABASE_SERVICE_KEY가 Vercel 빌드 타임에 없으면
// import만 해도 즉시 throw해서 빌드 자체가 깨진다(2026-07-22 확인). 이 파일은 getStaticProps에서
// 빌드 타임에 실행되므로, 이미 이 배포에서 검증된 NEXT_PUBLIC_* 익명키 클라이언트를 쓴다.
import { supabase } from './supabaseClient';
import { classifyProduct } from './foodClassifier';

function sortLeaves(node) {
  if (Array.isArray(node)) {
    node.sort((a, b) => {
      const da = a.broadcast_date + (a.time_start || '');
      const db = b.broadcast_date + (b.time_start || '');
      return da < db ? -1 : da > db ? 1 : 0;
    });
    return;
  }
  for (const key of Object.keys(node)) sortLeaves(node[key]);
}

async function fetchAllPages(select, filterFn) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase.from('tvdb_shopping').select(select).range(from, from + PAGE - 1);
    if (filterFn) query = filterFn(query);
    const { data, error } = await query;
    if (error) break;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

// 한 번의 빌드/재생성에서 분류할 최대 건수. 대량 스크래핑 직후엔 미분류 행이 수백 건씩
// 쌓일 수 있는데, 상한이 없으면 처리 건수만큼 시간이 늘어나서 Vercel 정적 빌드의 60초
// 워커 타임아웃에 걸린다(2026-07-23, 400건 쌓였을 때 실제로 발생). 이 상한을 넘는 나머지는
// food_top이 계속 NULL로 남아 다음 빌드/재생성(10분마다) 때 이어서 처리된다.
const CLASSIFY_MAX_PER_RUN = 300;
const CLASSIFY_CONCURRENCY = 20;

// 이 세션에서 tvdb_shopping에 food_top/food_sub/food_province/food_city 컬럼을 추가하고
// 기존 7,792행은 한 번에 백필했다(01_food_classification_backfill.sql). 그 이후로는 이 함수가
// food_top이 아직 NULL인(= 백필 이후 새로 스크래핑되어 들어온) 행만 분류해서 그 컬럼에 저장하고,
// 나머지(이미 분류가 끝난 지난 날짜 행들)는 절대 다시 분류하지 않는다 — DB에 저장된 값을 그대로 읽기만 함.
// 각 행의 update는 서로 의존관계가 없어서 동시에 여러 개를 보내도 안전 — 순차 처리 대신
// CLASSIFY_CONCURRENCY개씩 병렬로 보내서 전체 소요 시간을 건수와 무관하게 줄인다.
async function classifyNewRows() {
  const { data: pending, error } = await supabase
    .from('tvdb_shopping')
    .select('id, product_name')
    .is('food_top', null)
    .limit(CLASSIFY_MAX_PER_RUN);
  if (error || !pending || pending.length === 0) return;

  let idx = 0;
  async function worker() {
    while (idx < pending.length) {
      const row = pending[idx++];
      const c = classifyProduct(row.product_name);
      await supabase.from('tvdb_shopping').update({
        food_top: c ? c.top : '',
        food_sub: c ? c.sub : null,
        food_province: c ? c.province : null,
        food_city: c ? c.city : null,
      }).eq('id', row.id);
    }
  }
  const workerCount = Math.min(CLASSIFY_CONCURRENCY, pending.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
}

export async function loadFoodTree() {
  await classifyNewRows();

  const rows = await fetchAllPages(
    'id, broadcast_date, time_start, channel, product_name, price, food_top, food_sub, food_province, food_city',
    q => q.neq('food_top', '')
  );

  // 과일: top -> sub(복숭아 등) -> province(경북 등) -> city(의성 등, 없으면 '__flat__') -> rows[]
  // 건기식·식품: top -> sub(유산균 등) -> '__flat__' -> rows[]
  const tree = {};
  for (const row of rows) {
    const top = row.food_top;
    const sub = row.food_sub;
    tree[top] ??= {};
    tree[top][sub] ??= {};
    if (top === 'fruit') {
      tree[top][sub][row.food_province] ??= {};
      const cityKey = row.food_city || '__flat__';
      tree[top][sub][row.food_province][cityKey] ??= [];
      tree[top][sub][row.food_province][cityKey].push(row);
    } else {
      tree[top][sub]['__flat__'] ??= [];
      tree[top][sub]['__flat__'].push(row);
    }
  }
  sortLeaves(tree);
  return tree;
}
