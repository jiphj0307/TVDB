// "🎬 클립N" 모달(components/HealthArchiveView.js의 ClipPlayerModal)이 호출하는 API.
// tvchosun.com 클립 페이지(broadcast.tvchosun.com/.../scene|preview/*.cstv)는
// X-Frame-Options: SAMEORIGIN이라 브라우저에서 직접 iframe으로 못 띄운다. 그래서 이 페이지를
// 서버에서 대신 fetch해서, 그 안에 있는 실제 재생 스트림(m3u8) 주소만 정규식으로 뽑아 돌려준다
// — 클라이언트는 이 주소를 hls.js에 물려서 재생한다.
// 허용 도메인을 tvchosun.com 계열로 제한해서 임의 URL을 프록시로 악용하지 못하게 막는다.
const ALLOWED_HOST_SUFFIX = '.tvchosun.com';

export default async function handler(req, res) {
  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url 파라미터가 필요합니다' });
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: '올바르지 않은 URL입니다' });
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith(ALLOWED_HOST_SUFFIX)) {
    return res.status(400).json({ error: 'tvchosun.com 링크만 허용됩니다' });
  }

  try {
    const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!pageRes.ok) {
      return res.status(502).json({ error: `원본 페이지를 가져오지 못했습니다 (${pageRes.status})` });
    }
    const html = await pageRes.text();

    const match = html.match(/obj\.videosrc\s*=\s*"([^"]+)"/);
    if (!match) {
      return res.status(404).json({ error: '이 페이지에서 재생 스트림 주소를 찾지 못했습니다' });
    }

    let src = match[1];
    if (src.startsWith('//')) src = 'https:' + src;

    return res.status(200).json({ src });
  } catch (e) {
    return res.status(500).json({ error: e.message || '스트림 주소를 가져오는 중 오류가 발생했습니다' });
  }
}
