
// tvdb_program_episodes/tvdb_program_info를 방문할 때마다 브라우저에서 직접 훑지 않고,
// loadFoodTree.js와 동일한 패턴으로 서버가 미리(빌드/재생성 시점에) 한 번 받아서 정적으로
// 내려준다(pages/health.js의 getStaticProps + ISR). disease_tags는 이미 SQL 백필로 채워져
// 있고 수동 "분류수정"으로만 갱신되므로, loadFoodTree.js의 classifyNewRows() 같은 분류 단계는
// 여기선 필요 없다 — 그대로 읽어서 등록된 프로그램만 걸러 반환하면 끝.
import { supabase } from './supabaseClient';

async function fetchAllPages(table, select) {
  const PAGE = 1000;
  let all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) break;
    all = all.concat(data || []);
    if (!data || data.length < PAGE) break;
  }
  return all;
}

export async function loadHealthData() {
  const [episodeRows, infoRows] = await Promise.all([
    fetchAllPages('tvdb_program_episodes', 'id, channel, program_name, episode_no, air_date, content, disease_tags, blog_used, video_verified, memo, image_url, links'),
    fetchAllPages('tvdb_program_info', 'channel, program_name, replay_url, has_replay'),
  ]);
  // 관리자 미등록/삭제된 라벨은 여기서 미리 걸러서 내려준다 — 예전엔 클라이언트가 매번
  // infoMap을 만들어 필터링했는데, 그 판단 자체는 서버에서 한 번만 해도 되는 일이라서.
  const infoKeys = new Set(infoRows.map(i => `${i.channel}|${i.program_name}`));
  const rows = episodeRows.filter(r => r.channel && r.program_name && infoKeys.has(`${r.channel}|${r.program_name}`));
  return { rows, infoRows };
}
