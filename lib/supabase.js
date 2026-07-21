import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수가 없습니다 (.env 또는 GitHub Secrets 확인)');
}

export const supabase = createClient(url, key);
