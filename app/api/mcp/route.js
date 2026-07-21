// app/api/mcp/route.js
//
// TVDB(홈쇼핑/방송편성표 아카이브) 사이트용 MCP(Model Context Protocol) 서버.
// Vercel 공식 mcp-handler 패키지로 Streamable HTTP 프로토콜을 구현합니다.
// Fresh Season(minsiljang0/Fresh_Season) 프로젝트의 app/api/mcp/route.js를
// 그대로 옮겨오되, TVDB에는 블로그/키워드리서치/스레드 기능이 없으므로
// 범용 인프라 툴만 남긴 서브셋입니다.
//
// 노출 툴 12개:
//   - list_tables          : DB 테이블 목록 조회
//   - get_rows              : DB 테이블 데이터 조회 (필터·검색·정렬·페이징)
//   - upsert_row            : DB 행 추가·수정
//   - delete_row            : DB 행 삭제
//   - run_sql               : SQL 직접 실행 (SELECT/UPDATE/DELETE, 위험 DDL은 차단)
//   - list_github_files     : GitHub 저장소(jiphj0307/TVDB) 파일 목록 조회
//   - get_github_file       : GitHub 저장소(jiphj0307/TVDB) 파일 내용 조회
//   - get_system_prompt     : Claude 프로젝트 지침 조회
//   - update_system_prompt  : Claude 프로젝트 지침 덮어쓰기
//   - append_system_prompt  : Claude 프로젝트 지침 맨 아래에 추가
//   - capture_screenshot    : 웹페이지 그래프·차트를 헤드리스 브라우저로 캡처해 Storage에 저장
//                             (홈쇼핑/방송사 편성표 페이지가 이미지가 아니라 JS로 그려질 때 대비용)
//   - get_shopping_collection_status : 홈쇼핑 16개 채널 수집 현황 + 채널별 수집 지침을 한번에 조회
//                             (2026-07-22 추가 — 세션이 끊겨도 "어디까지 됐고 어떻게 이어서 하는지"를
//                             대화 기록 없이 이 툴 하나로 알 수 있게 하기 위함. 아래 등록부 참고)
//
// ── system_prompts 테이블 (Supabase에 최초 1회 생성 필요) ─────────────────
// get_system_prompt/update_system_prompt/append_system_prompt가 사용합니다.
// 정확한 CREATE TABLE 문은 scratchpad/TVDB/system_prompt_table.sql 참고.
//
// ── run_sql_query / get_tables_info RPC 함수 (Supabase에 최초 1회 생성 필요) ──
// run_sql/list_tables 툴이 supabase.rpc(...)로 호출합니다. Fresh Season 저장소
// GitHub에는 이 두 함수의 정의가 없습니다 (Fresh Season의 Supabase SQL 에디터에서만
// 직접 만들어져 있고 repo에는 마이그레이션 파일로 남아있지 않음) — 그래서 원본을
// 그대로 옮겨올 수 없었고, 아래는 동작을 재현한 추정 구현입니다. 반드시 Supabase
// SQL 에디터에서 실행 후 run_sql/list_tables 툴을 실제로 한 번 호출해 검증하세요.
// (system_prompt_table.sql에 이 두 함수 정의도 함께 넣어뒀습니다.)
//
// 필요한 환경변수 (Vercel 프로젝트 설정 > Environment Variables):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   - Fresh Season과 동일한 이름 그대로 사용
//                                                 (TVDB의 .env.example에 있는 SUPABASE_SERVICE_KEY가
//                                                 아니라 SUPABASE_SERVICE_ROLE_KEY입니다 — Fresh Season
//                                                 원본 코드 기준으로 이름을 맞췄습니다. 이름이 다르면
//                                                 이 파일을 고치지 말고 Vercel 쪽 변수명을 맞추세요.)
//   MCP_SHARED_SECRET                          - 이 MCP 서버 보호용 공유 비밀키 (직접 정해서 등록)
//   GITHUB_TOKEN (선택)                        - list_github_files/get_github_file 툴의 GitHub API
//                                                 요청 한도를 늘리고 싶을 때만 등록. 없어도 동작
//                                                 (jiphj0307/TVDB가 공개 저장소라면 시간당 60회 제한)
//
// claude.ai 커넥터 등록 주소 (Settings > Connectors > Add custom connector):
//   https://<TVDB의 Vercel 배포 도메인>/api/mcp?key=여기에_MCP_SHARED_SECRET_값

import { createMcpHandler } from 'mcp-handler'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const GITHUB_OWNER_REPO = 'jiphj0307/TVDB'

// ── MCP 서버 정의 ─────────────────────────────────────────────────────
const baseHandler = createMcpHandler(
  (server) => {
    // ── Claude 시스템 프롬프트(지침) 관리 ────────────────────────────────
    // Fresh Season 원본은 5개 탭(claude/main/main2/month/threads)을 고정 enum으로
    // 뒀지만, 그건 블로그 자동화 파이프라인 전용 구분이라 TVDB에는 그대로 옮길
    // 근거가 없습니다. 대신 자유 문자열 id(기본값 "claude")로 단순화했습니다 —
    // 필요해지면 나중에 탭을 늘려도 스키마(테이블)는 그대로 씁니다.
    server.registerTool(
      'get_system_prompt',
      {
        title: 'Claude 시스템 프롬프트(지침) 조회',
        description:
          'admin에 저장된 Claude 프로젝트 지침을 가져온다. ' +
          'id를 주면 해당 탭만 가져오고, 비우면 "claude"(메인 지침) 탭을 가져온다. ' +
          '대화를 시작할 때 가장 먼저 호출해서 지침을 로드하고, 그 내용대로 행동한다.',
        inputSchema: {
          id: z.string().optional().describe('불러올 탭 id. 비우면 "claude"(메인 지침)'),
        },
      },
      async ({ id }) => {
        const tabId = id || 'claude'
        const { data, error } = await supabase
          .from('system_prompts')
          .select('content, updated_at')
          .eq('id', tabId)
          .single()
        if (error || !data) {
          return { content: [{ type: 'text', text: `❌ [${tabId}] 시스템 프롬프트를 불러오지 못했습니다. 먼저 update_system_prompt로 저장했는지 확인해주세요.` }], isError: true }
        }
        return {
          content: [{
            type: 'text',
            text: `# 시스템 프롬프트 로드 완료 [${tabId}] (저장일시: ${data.updated_at})\n\n` + data.content,
          }],
        }
      }
    )

    server.registerTool(
      'update_system_prompt',
      {
        title: 'Claude 시스템 프롬프트(지침) 저장',
        description:
          'admin에 저장된 Claude 프로젝트 지침을 덮어쓴다. id로 어느 탭을 덮어쓸지 지정한다 ' +
          '(비우면 "claude"). 지침 전문을 content에 담아 전달하면 해당 탭의 기존 내용을 ' +
          '완전히 교체한다. 저장 후 get_system_prompt로 다시 불러와서 확인하는 것을 권장한다.',
        inputSchema: {
          id: z.string().optional().describe('덮어쓸 탭 id. 비우면 "claude"'),
          content: z.string().describe('새로 저장할 지침 전문 (마크다운)'),
        },
        annotations: { destructiveHint: true, idempotentHint: false },
      },
      async ({ id, content }) => {
        const tabId = id || 'claude'
        const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')
        const { error } = await supabase
          .from('system_prompts')
          .upsert({ id: tabId, content, updated_at: nowKST }, { onConflict: 'id' })
        if (error) {
          return { content: [{ type: 'text', text: `❌ 저장 실패: ${error.message}` }], isError: true }
        }
        return {
          content: [{ type: 'text', text: `✅ [${tabId}] 시스템 프롬프트 저장 완료 (${nowKST})\n\n저장된 글자수: ${content.length.toLocaleString()}자` }],
        }
      }
    )

    server.registerTool(
      'append_system_prompt',
      {
        title: 'Claude 시스템 프롬프트(지침) 맨 아래에 추가',
        description:
          'admin에 저장된 Claude 프로젝트 지침의 특정 탭 맨 아래에 새 내용을 이어붙인다. ' +
          'update_system_prompt처럼 전체 내용을 다시 불러와서 통째로 다시 보낼 필요 없이, ' +
          '추가할 내용만 전달하면 서버가 기존 내용 뒤에 이어붙여 저장한다. 계속 누적되는 로그 ' +
          '성격 문서에 새 기록 한 건을 추가할 때 update_system_prompt 대신 우선 사용한다. ' +
          '문서 중간에 끼워 넣어야 하거나 기존 내용을 수정·삭제해야 할 때는 이 툴로는 안 되니 ' +
          'get_system_prompt로 전체를 불러온 뒤 update_system_prompt를 쓴다.',
        inputSchema: {
          id: z.string().describe('추가할 탭 id'),
          content: z.string().describe('맨 아래에 추가할 내용 (마크다운). 앞뒤 구분용 빈 줄은 자동으로 들어가므로 따로 넣지 않아도 됨'),
        },
        annotations: { destructiveHint: false, idempotentHint: false },
      },
      async ({ id, content }) => {
        const { data: existing, error: readErr } = await supabase
          .from('system_prompts')
          .select('content')
          .eq('id', id)
          .single()
        if (readErr || !existing) {
          return { content: [{ type: 'text', text: `❌ [${id}] 기존 지침을 불러오지 못했습니다: ${readErr?.message || '문서 없음'}` }], isError: true }
        }
        const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().replace('Z', '+09:00')
        const newContent = existing.content.replace(/\n+$/, '') + '\n\n' + content.trim() + '\n'
        const { error: writeErr } = await supabase
          .from('system_prompts')
          .upsert({ id, content: newContent, updated_at: nowKST }, { onConflict: 'id' })
        if (writeErr) {
          return { content: [{ type: 'text', text: `❌ 저장 실패: ${writeErr.message}` }], isError: true }
        }
        return {
          content: [{ type: 'text', text: `✅ [${id}] 맨 아래에 추가 완료 (${nowKST})\n\n추가된 글자수: ${content.trim().length.toLocaleString()}자 / 총 글자수: ${newContent.length.toLocaleString()}자` }],
        }
      }
    )

    // ── 웹페이지 그래프·차트 스크린샷 캡처 ────────────────────────────────
    // Fresh Season은 blog-images 버킷을 썼지만, TVDB에는 블로그가 없으므로
    // tvdb-images 버킷으로 이름만 바꿨습니다. 나머지 로직(puppeteer-core +
    // @sparticuz/chromium-min 조합, selector 캡처, PNG 업로드)은 동일합니다.
    async function ensureScreenshotBucket() {
      const { data: buckets } = await supabase.storage.listBuckets()
      if (buckets?.some(b => b.name === 'tvdb-images')) return
      await supabase.storage.createBucket('tvdb-images', { public: true, fileSizeLimit: '5MB' })
    }

    server.registerTool(
      'capture_screenshot',
      {
        title: '웹페이지 그래프·차트 스크린샷 캡처 및 저장',
        description:
          '홈쇼핑·방송사 공식 페이지 등에 있는 편성표·그래프·차트를 헤드리스 브라우저로 실제로 캡처해서 ' +
          'Supabase Storage(tvdb-images 버킷)에 저장하고 공개 URL을 반환한다. selector를 주면 그 요소만 잘라서 ' +
          '캡처하고, 안 주면 뷰포트 전체를 캡처한다. **이 툴은 출처 페이지에 실제 이미지 파일(<img>)이 없고 ' +
          '자바스크립트/캔버스로 그려지는 콘텐츠일 때만 쓴다 — 이미지 파일이 이미 있으면 그냥 그 URL을 직접 ' +
          '쓰는 게 먼저다.** 저작권 있는 자료를 그대로 재게시하는 것이므로, 결과를 쓸 때는 출처(사이트명 + ' +
          '원본 링크)를 함께 표기할 것.',
        inputSchema: {
          url: z.string().describe('캡처할 페이지 URL'),
          selector: z.string().optional().describe('캡처할 특정 요소의 CSS selector (예: "#chart-container", ".schedule-table"). 안 주면 뷰포트 전체를 캡처'),
          waitMs: z.number().int().min(0).max(8000).optional().describe('페이지 로드 후 추가로 기다릴 시간(ms). 자바스크립트로 그려지는 콘텐츠가 렌더링될 시간을 줄 때 사용. 기본 1500'),
          width: z.number().int().min(320).max(1920).optional().describe('뷰포트 너비. 기본 1200'),
        },
        annotations: { destructiveHint: false },
      },
      async ({ url, selector, waitMs = 1500, width = 1200 }) => {
        let browser
        try {
          const { default: chromium } = await import('@sparticuz/chromium-min')
          const puppeteer = await import('puppeteer-core')
          // ⚠️ 이 URL의 버전(v131.0.1)은 package.json의 @sparticuz/chromium-min 버전과 반드시 일치해야 한다.
          // npm install 이후 버전이 다르면 https://github.com/Sparticuz/chromium/releases 에서 맞는 pack.tar로 교체할 것.
          const executablePath = await chromium.executablePath(
            'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'
          )
          browser = await puppeteer.default.launch({
            args: chromium.args,
            executablePath,
            headless: true,
            defaultViewport: { width, height: 900 },
          })
          const page = await browser.newPage()
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 })
          if (waitMs) await new Promise(r => setTimeout(r, waitMs))

          let buffer
          if (selector) {
            const el = await page.$(selector)
            if (!el) throw new Error(`selector "${selector}"에 해당하는 요소를 찾을 수 없음`)
            buffer = await el.screenshot({ type: 'png' })
          } else {
            buffer = await page.screenshot({ type: 'png' })
          }
          await browser.close()
          browser = null

          await ensureScreenshotBucket()
          const path = `captures/${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.png`
          const { error: upErr } = await supabase.storage.from('tvdb-images').upload(path, buffer, { contentType: 'image/png', upsert: false })
          if (upErr) return { content: [{ type: 'text', text: `❌ 업로드 실패: ${upErr.message}` }], isError: true }
          const { data: pub } = supabase.storage.from('tvdb-images').getPublicUrl(path)

          return { content: [{ type: 'text', text: `✅ 캡처 완료\nURL: ${pub.publicUrl}\n원본 페이지: ${url}\n⚠️ 쓸 때 반드시 출처(사이트명+원본 링크)를 함께 표기할 것.` }] }
        } catch (e) {
          if (browser) { try { await browser.close() } catch {} }
          return { content: [{ type: 'text', text: `❌ 캡처 실패: ${e.message}` }], isError: true }
        }
      }
    )

    // ── GitHub 저장소 확인 툴 ────────────────────────────────────────────
    // TVDB 저장소(jiphj0307/TVDB)에 실제로 어떤 파일이 올라가 있는지 확인할 때 쓴다.
    // 공개 저장소라면 토큰 없이도 동작하지만(시간당 60회 제한), GITHUB_TOKEN 환경변수를
    // 등록해두면 그 제한이 훨씬 늘어난다.

    server.registerTool(
      'list_github_files',
      {
        title: 'GitHub 저장소 파일 목록 조회',
        description: `${GITHUB_OWNER_REPO} 저장소의 특정 경로에 어떤 파일·폴더가 있는지 조회한다. path를 비우면 저장소 루트를 본다. GitHub에 실제로 무엇이 올라가 있는지 확인할 때 사용.`,
        inputSchema: {
          path: z.string().optional().describe('조회할 경로. 예: "pages" 또는 "app/api/mcp". 비우면 루트'),
          ref: z.string().optional().describe('브랜치/커밋. 기본: main'),
        },
      },
      async ({ path = '', ref = 'main' }) => {
        const url = `https://api.github.com/repos/${GITHUB_OWNER_REPO}/contents/${path}?ref=${encodeURIComponent(ref)}`
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tvdb-mcp' }
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
        const res = await fetch(url, { headers })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { content: [{ type: 'text', text: `❌ GitHub API 오류 (${res.status}): ${text}` }], isError: true }
        }
        const data = await res.json()
        const list = Array.isArray(data) ? data : [data]
        const lines = list.map(f => `${f.type === 'dir' ? '📁' : '📄'} ${f.path}${f.type === 'file' ? ` (${f.size} bytes)` : ''}`)
        return { content: [{ type: 'text', text: lines.join('\n') }] }
      }
    )

    server.registerTool(
      'get_github_file',
      {
        title: 'GitHub 저장소 파일 내용 조회',
        description: `${GITHUB_OWNER_REPO} 저장소의 특정 파일 내용을 텍스트로 가져온다. list_github_files로 경로 확인 후 사용. 100KB 넘는 파일은 GitHub API 제약으로 못 가져올 수 있다.`,
        inputSchema: {
          path: z.string().describe('파일 경로. 예: "pages/admin.js"'),
          ref: z.string().optional().describe('브랜치/커밋. 기본: main'),
        },
      },
      async ({ path, ref = 'main' }) => {
        const url = `https://api.github.com/repos/${GITHUB_OWNER_REPO}/contents/${path}?ref=${encodeURIComponent(ref)}`
        const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'tvdb-mcp' }
        if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
        const res = await fetch(url, { headers })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          return { content: [{ type: 'text', text: `❌ GitHub API 오류 (${res.status}): ${text}` }], isError: true }
        }
        const data = await res.json()
        if (data.type !== 'file') return { content: [{ type: 'text', text: `❌ "${path}"는 파일이 아니라 ${data.type}입니다` }], isError: true }
        const content = Buffer.from(data.content, data.encoding || 'base64').toString('utf-8')
        return { content: [{ type: 'text', text: `[${path}] (${data.size} bytes)\n\n${content}` }] }
      }
    )

    // ── Supabase 직접 조회·수정 툴 ──────────────────────────────────────

    server.registerTool(
      'list_tables',
      {
        title: 'DB 테이블 목록 조회',
        description: 'list_tables — DB 테이블 목록 조회. Supabase DB에 있는 테이블 목록과 각 테이블의 컬럼 정보를 반환한다. 어떤 테이블이 있는지 모를 때 가장 먼저 호출한다.',
        inputSchema: {
          schema: z.string().optional().describe('스키마 이름. 기본값: public'),
        },
      },
      async ({ schema = 'public' }) => {
        const { data, error } = await supabase
          .rpc('get_tables_info', { schema_name: schema })
          .select()
        if (error) {
          // rpc 없으면 information_schema로 fallback
          const { data: d2, error: e2 } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', schema)
            .eq('table_type', 'BASE TABLE')
            .order('table_name')
          if (e2) {
            // 최후 수단: SQL로 직접
            const { data: d3, error: e3 } = await supabase.rpc('run_sql_query', {
              sql: `SELECT table_name FROM information_schema.tables WHERE table_schema = '${schema}' AND table_type = 'BASE TABLE' ORDER BY table_name`
            })
            if (e3) return { content: [{ type: 'text', text: `❌ ${e3.message}` }], isError: true }
            return { content: [{ type: 'text', text: JSON.stringify(d3, null, 2) }] }
          }
          const names = (d2 || []).map(r => r.table_name).join('\n')
          return { content: [{ type: 'text', text: `테이블 목록 (${schema} 스키마):\n${names}` }] }
        }
        return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
      }
    )

    server.registerTool(
      'get_rows',
      {
        title: 'DB 테이블 데이터 조회',
        description: 'get_rows — DB 테이블 데이터 조회. 특정 테이블의 행을 조회한다. 필터·텍스트검색·정렬·페이징 지원, 최대 500행. 데이터 확인이나 수정 전 ID 조회에 사용.',
        inputSchema: {
          table:   z.string().describe('테이블 이름. 예: broadcast_schedule, shopping_products'),
          select:  z.string().optional().describe('가져올 컬럼 (쉼표 구분). 비우면 전체(*). 예: id,name,created_at'),
          filter:  z.record(z.string()).optional().describe('eq 필터. 예: {"channel":"홈앤쇼핑"}'),
          search_column: z.string().optional().describe('텍스트 검색할 컬럼. search_value와 함께 사용'),
          search_value:  z.string().optional().describe('텍스트 검색어 (ilike, 부분일치)'),
          order_by: z.string().optional().describe('정렬 기준 컬럼. 기본: created_at'),
          ascending: z.boolean().optional().describe('오름차순 여부. 기본: false (최신순)'),
          limit:   z.number().int().min(1).max(500).optional().describe('가져올 행 수. 기본: 50, 최대: 500'),
          offset:  z.number().int().min(0).optional().describe('건너뛸 행 수 (페이징). 기본: 0'),
        },
      },
      async ({ table, select = '*', filter, search_column, search_value, order_by = 'created_at', ascending = false, limit = 50, offset = 0 }) => {
        let q = supabase.from(table).select(select)
        if (filter) {
          for (const [col, val] of Object.entries(filter)) q = q.eq(col, val)
        }
        if (search_column && search_value) q = q.ilike(search_column, `%${search_value}%`)
        q = q.order(order_by, { ascending }).range(offset, offset + limit - 1)
        const { data, error, count } = await q
        if (error) return { content: [{ type: 'text', text: `❌ ${error.message}` }], isError: true }
        if (!data?.length) return { content: [{ type: 'text', text: `(결과 없음) 테이블: ${table}` }] }
        return { content: [{ type: 'text', text: `[${table}] ${data.length}행 반환 (offset:${offset})\n${JSON.stringify(data, null, 2)}` }] }
      }
    )

    server.registerTool(
      'upsert_row',
      {
        title: 'DB 행 추가·수정',
        description: 'upsert_row — DB 행 추가·수정. 테이블에 행을 추가하거나 수정한다. id를 포함하면 수정(upsert), 없으면 새 행 추가. 수정 전 get_rows로 기존 데이터를 먼저 확인할 것.',
        inputSchema: {
          table: z.string().describe('테이블 이름. 예: broadcast_schedule, shopping_products'),
          row:   z.record(z.any()).describe('추가·수정할 데이터 객체. 예: {"id":"abc","name":"고사리","status":"active"}'),
        },
        annotations: { destructiveHint: true },
      },
      async ({ table, row }) => {
        const { data, error } = await supabase
          .from(table)
          .upsert([row], { onConflict: 'id' })
          .select()
          .single()
        if (error) return { content: [{ type: 'text', text: `❌ ${error.message}` }], isError: true }
        return { content: [{ type: 'text', text: `✅ [${table}] upsert 완료\n${JSON.stringify(data, null, 2)}` }] }
      }
    )

    server.registerTool(
      'delete_row',
      {
        title: 'DB 행 삭제',
        description: 'delete_row — DB 행 삭제. 테이블에서 특정 id의 행을 삭제한다. 삭제 전 존재 자동 확인, 되돌릴 수 없음. 삭제 전 반드시 get_rows로 대상을 먼저 확인할 것.',
        inputSchema: {
          table: z.string().describe('테이블 이름'),
          id:    z.string().describe('삭제할 행의 id'),
        },
        annotations: { destructiveHint: true },
      },
      async ({ table, id }) => {
        // 삭제 전 존재 확인
        const { data: existing } = await supabase.from(table).select('id').eq('id', id).maybeSingle()
        if (!existing) return { content: [{ type: 'text', text: `❌ [${table}] id="${id}" 행을 찾을 수 없음` }], isError: true }
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) return { content: [{ type: 'text', text: `❌ ${error.message}` }], isError: true }
        return { content: [{ type: 'text', text: `✅ [${table}] id="${id}" 삭제 완료` }] }
      }
    )

    server.registerTool(
      'run_sql',
      {
        title: 'SQL 직접 실행',
        description: 'run_sql — SQL 직접 실행. 복잡한 조회나 수정이 필요할 때 SQL 쿼리를 직접 실행한다. SELECT/UPDATE/DELETE 모두 가능. DROP·TRUNCATE·ALTER 등 위험 DDL은 자동 차단.',
        inputSchema: {
          sql: z.string().describe('실행할 SQL 쿼리. 예: SELECT id, channel, air_date FROM broadcast_schedule ORDER BY air_date DESC LIMIT 20'),
        },
        annotations: { destructiveHint: true },
      },
      async ({ sql }) => {
        const upper = sql.trim().toUpperCase()
        const dangerous = ['DROP ', 'TRUNCATE ', 'ALTER TABLE', 'CREATE TABLE', 'GRANT ', 'REVOKE ']
        if (dangerous.some(kw => upper.startsWith(kw) || upper.includes('\n' + kw))) {
          return { content: [{ type: 'text', text: `⛔ 위험한 DDL/권한 쿼리는 차단됩니다: ${sql.slice(0, 80)}` }], isError: true }
        }
        const { data, error } = await supabase.rpc('run_sql_query', { sql })
        if (error) return { content: [{ type: 'text', text: `❌ ${error.message}\n\nSQL: ${sql}` }], isError: true }
        return { content: [{ type: 'text', text: `✅ SQL 실행 완료\n${JSON.stringify(data, null, 2)}` }] }
      }
    )

    // ── 홈쇼핑 채널별 수집 현황 + 수집 지침 조회 ─────────────────────────
    // "루틴화" 목적: 세션이 끊기거나 사람이 바뀌어도, 대화 기록에 의존하지 않고
    // 이 툴 하나로 "어느 채널이 며칠치 밀렸는지"와 "그 채널을 어떻게 수집하는지"를
    // 동시에 알 수 있게 한다. tvdb_channel_notes.note에 채널별 URL/curl 또는 브라우저
    // 자동화 방식이 이미 상세히 적혀 있으므로(get_system_prompt 요약보다 이쪽이 더 상세),
    // tvdb_shopping의 실제 데이터(=진행상황, 거짓말할 수 없음)와 그대로 조인해서 반환한다.
    server.registerTool(
      'get_shopping_collection_status',
      {
        title: '홈쇼핑 채널별 수집 현황 + 수집 지침 조회',
        description:
          '16개 홈쇼핑 채널이 tvdb_shopping에 실제로 어느 날짜까지 수집돼 있는지(첫 수집일·마지막 ' +
          '수집일·건수·오늘 기준 며칠 뒤처졌는지)와, 각 채널을 어떻게 수집하는지(tvdb_channel_notes에 ' +
          '저장된 소스 URL·curl/브라우저 자동화 방식 메모)를 한 번에 반환한다. 홈쇼핑 스크래핑을 새로 ' +
          '이어서 할 때 이전 대화 기록이 없어도 이 툴 하나만 호출하면 "어디까지 됐고 어떻게 채널별로 ' +
          '가져오면 되는지"를 바로 알 수 있다. 가장 뒤처진(오래된) 채널이 먼저 오도록 정렬해서 반환하므로, ' +
          '위에서부터 순서대로 그 채널의 "마지막 수집일 다음날"부터 이어서 스크래핑하면 된다.',
        inputSchema: {},
      },
      async () => {
        const { data: statusRows, error: e1 } = await supabase.rpc('run_sql_query', {
          sql: `SELECT channel, MIN(broadcast_date) AS first_date, MAX(broadcast_date) AS last_date, COUNT(*) AS cnt FROM tvdb_shopping GROUP BY channel ORDER BY last_date ASC`
        })
        if (e1) return { content: [{ type: 'text', text: `❌ ${e1.message}` }], isError: true }

        const { data: notes } = await supabase.from('tvdb_channel_notes').select('channel, note')
        const noteMap = {}
        ;(notes || []).forEach(n => { noteMap[n.channel] = n.note })

        const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const lines = (statusRows || []).map(r => {
          const behindDays = Math.round((new Date(todayKST) - new Date(r.last_date)) / 86400000)
          const status = behindDays <= 0 ? '오늘까지 완료' : `${behindDays}일 뒤처짐`
          const note = noteMap[r.channel] ? noteMap[r.channel] : '(수집 방식 메모 없음 — tvdb_channel_notes에 없는 채널)'
          return `### ${r.channel}\n- 보유 기간: ${r.first_date} ~ ${r.last_date} (${r.cnt}건)\n- 상태: ${status}\n- 수집방법: ${note}`
        })

        return {
          content: [{
            type: 'text',
            text: `# 홈쇼핑 채널별 수집 현황 (오늘 KST: ${todayKST})\n\n` +
              `뒤처진 채널부터 정렬됨. 각 채널의 "마지막 수집일 다음날"부터 아래 "수집방법"에 적힌 방식대로 ` +
              `이어서 스크래핑한 뒤, upsert_row 또는 run_sql로 tvdb_shopping에 INSERT할 것 ` +
              `(unique 제약: broadcast_date, time_start, channel, product_name — 겹치는 건 자동으로 걸러짐).\n\n` +
              lines.join('\n\n'),
          }],
        }
      }
    )
  },
  {
    instructions:
      'TVDB(홈쇼핑/방송편성표 아카이브) 사이트 인프라 서버. ' +
      'Supabase DB 직접 조회·수정 도구(list_tables/get_rows/upsert_row/delete_row/run_sql), ' +
      'GitHub 저장소(jiphj0307/TVDB) 파일 확인 도구(list_github_files/get_github_file), ' +
      'Claude 프로젝트 지침 조회·저장 도구(get_system_prompt/update_system_prompt/append_system_prompt), ' +
      '방송사·홈쇼핑 공식 페이지의 그래프·표를 실제로 캡처해서 저장하는 도구(capture_screenshot), ' +
      '홈쇼핑 채널별 수집 현황+수집 지침을 한번에 조회하는 도구(get_shopping_collection_status)를 제공한다. ' +
      '홈쇼핑 데이터를 새로 수집/이어서 할 때는 가장 먼저 get_shopping_collection_status를 호출해서 ' +
      '어느 채널이 며칠치 밀렸고 어떻게 가져오는지부터 확인할 것. ' +
      'DB 테이블을 조회/수정하거나, 저장소 파일을 확인하거나, 프로젝트 지침을 읽고 쓸 때 이 서버의 도구를 사용한다.',
  },
  { basePath: '/api', maxDuration: 30, verboseLogs: true }
)

// ?key= 쿼리파라미터 인증.
// Fresh Season에서 커스텀 OAuth를 시도했다가 claude.ai 커넥터가 "인증 없는" MCP
// 서버에 연결할 때 강제로 OAuth 클라이언트 등록(DCR)을 시도하고 실패하는 별도
// 버그를 겪은 뒤 이 방식으로 되돌렸습니다 (Anthropic 이슈 #402, #413, #457).
// TVDB도 동일한 이유로 처음부터 이 방식을 그대로 씁니다 — bearer 헤더가 아니라
// URL 쿼리파라미터 key=의 값을 MCP_SHARED_SECRET 환경변수와 문자열 비교합니다.
async function authedHandler(request) {
  const url = new URL(request.url)
  const key = url.searchParams.get('key')
  if (!process.env.MCP_SHARED_SECRET || key !== process.env.MCP_SHARED_SECRET) {
    return new Response(JSON.stringify({ error: '인증 필요 (key 파라미터 확인)' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return baseHandler(request)
}

export { authedHandler as GET, authedHandler as POST }
