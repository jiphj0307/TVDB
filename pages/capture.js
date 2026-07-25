import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';

// 데스크톱 다운로더 앱의 "2번 방식(화면 직접 캡처)"을 브라우저에서 그대로 쓰기 위한 페이지.
// 서버는 전혀 관여하지 않는다 — getDisplayMedia로 사용자 자신의 화면/창/탭 공유 권한을 받아
// 그 비디오 스트림의 한 프레임을 캔버스에 그린 뒤, 브라우저 로컬에서 바로 png로 다운로드한다.
// TVDB 데이터(Supabase 등)와는 무관한 개인용 도구라서 Nav에는 올리지 않고 이 URL로 직접 접근한다.

function download(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const HANDLE = 10;

export default function CapturePage() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // 캡처된 전체 프레임을 그리는 캔버스(화면 표시용)
  const streamRef = useRef(null);
  const containerRef = useRef(null);

  const [sharing, setSharing] = useState(false);
  const [captured, setCaptured] = useState(false); // 프레임을 한 장 캡처해서 자르기 모드로 들어왔는지
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 }); // 캡처된 원본 픽셀 크기
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 }); // 화면에 실제 보여지는 크기(축소 표시)
  const [rect, setRect] = useState(null); // 화면표시 좌표계 기준 선택 영역 {x1,y1,x2,y2}
  const dragRef = useRef({ mode: null, origin: null, orig: null, start: null });

  async function startShare() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 } });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setSharing(true);
      setCaptured(false);
      stream.getVideoTracks()[0].addEventListener('ended', stopShare);
    } catch (e) {
      alert('화면 공유를 시작하지 못했습니다: ' + e.message);
    }
  }

  function stopShare() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setSharing(false);
  }

  function captureFrame() {
    const video = videoRef.current;
    const w = video.videoWidth, h = video.videoHeight;
    const canvas = canvasRef.current;
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    // 미리보기 영역(최대 900px 폭)에 맞춰 축소 표시 — 실제 캡처 해상도는 그대로 유지하고
    // 선택 영역 좌표만 나중에 축소비율로 환산해서 원본 좌표로 되돌린다.
    const maxW = Math.min(900, window.innerWidth - 64);
    const scale = Math.min(1, maxW / w);
    setNaturalSize({ w, h });
    setDisplaySize({ w: Math.round(w * scale), h: Math.round(h * scale) });
    setRect(null);
    setCaptured(true);
  }

  function retake() {
    setCaptured(false);
    setRect(null);
  }

  function hitTest(x, y, r) {
    if (!r) return null;
    const { x1, y1, x2, y2 } = r;
    const positions = {
      nw: [x1, y1], n: [(x1 + x2) / 2, y1], ne: [x2, y1],
      w: [x1, (y1 + y2) / 2], e: [x2, (y1 + y2) / 2],
      sw: [x1, y2], s: [(x1 + x2) / 2, y2], se: [x2, y2],
    };
    for (const [name, [hx, hy]] of Object.entries(positions)) {
      if (Math.abs(x - hx) <= HANDLE && Math.abs(y - hy) <= HANDLE) return name;
    }
    if (x1 < x && x < x2 && y1 < y && y < y2) return 'move';
    return null;
  }

  function getPos(e) {
    const box = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  }

  function onPointerDown(e) {
    const { x, y } = getPos(e);
    const hit = hitTest(x, y, rect);
    if (!rect || !hit) {
      dragRef.current = { mode: 'new', start: { x, y } };
      setRect({ x1: x, y1: y, x2: x, y2: y });
    } else {
      dragRef.current = { mode: hit, origin: { x, y }, orig: rect };
    }
    e.target.setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d.mode) return;
    const { x, y } = getPos(e);
    if (d.mode === 'new') {
      const { x: sx, y: sy } = d.start;
      setRect({ x1: Math.min(sx, x), y1: Math.min(sy, y), x2: Math.max(sx, x), y2: Math.max(sy, y) });
    } else if (d.mode === 'move') {
      const dx = x - d.origin.x, dy = y - d.origin.y;
      const { x1, y1, x2, y2 } = d.orig;
      setRect({ x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy });
    } else {
      let { x1, y1, x2, y2 } = d.orig;
      const dx = x - d.origin.x, dy = y - d.origin.y;
      if (d.mode.includes('n')) y1 += dy;
      if (d.mode.includes('s')) y2 += dy;
      if (d.mode.includes('w')) x1 += dx;
      if (d.mode.includes('e')) x2 += dx;
      setRect({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) });
    }
  }

  function onPointerUp() {
    dragRef.current = { mode: null };
  }

  function downloadFull() {
    download(canvasRef.current.toDataURL('image/png'), `screen_${timestamp()}.png`);
  }

  function downloadRegion() {
    if (!rect || Math.abs(rect.x2 - rect.x1) < 5 || Math.abs(rect.y2 - rect.y1) < 5) {
      alert('먼저 영역을 드래그로 선택해주세요.');
      return;
    }
    const scaleX = naturalSize.w / displaySize.w;
    const scaleY = naturalSize.h / displaySize.h;
    const sx = Math.round(rect.x1 * scaleX), sy = Math.round(rect.y1 * scaleY);
    const sw = Math.round((rect.x2 - rect.x1) * scaleX), sh = Math.round((rect.y2 - rect.y1) * scaleY);

    const out = document.createElement('canvas');
    out.width = sw;
    out.height = sh;
    out.getContext('2d').drawImage(canvasRef.current, sx, sy, sw, sh, 0, 0, sw, sh);
    download(out.toDataURL('image/png'), `region_${timestamp()}.png`);
  }

  useEffect(() => () => streamRef.current?.getTracks().forEach(t => t.stop()), []);

  return (
    <>
      <Head><title>화면 캡처 — TVDB</title></Head>
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 960, margin: '0 auto', padding: '24px 16px', color: '#222' }}>
        <h1 style={{ fontSize: 20, marginBottom: 4 }}>🖥️ 화면 캡처 (온라인판 2번 방식)</h1>
        <p style={{ color: '#666', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          서버로 아무것도 전송하지 않습니다 — 브라우저 화면 공유 권한만으로 이 기기에서 바로
          캡처하고 바로 다운로드합니다. 다운로드 자체가 안 되는 사이트를 재생해두고 캡처하는
          용도로 쓰세요.
        </p>

        {!sharing && !captured && (
          <button onClick={startShare} style={btnPrimary}>화면 공유 시작</button>
        )}

        {sharing && (
          <div>
            <video ref={videoRef} muted style={{ width: '100%', maxWidth: 900, borderRadius: 8, background: '#000', display: captured ? 'none' : 'block' }} />
            {!captured && (
              <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                <button onClick={captureFrame} style={btnPrimary}>📸 캡처(현재 프레임)</button>
                <button onClick={stopShare} style={btnSecondary}>공유 중지</button>
              </div>
            )}
          </div>
        )}

        {captured && (
          <div>
            <div ref={containerRef}
              onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
              style={{ position: 'relative', width: displaySize.w, height: displaySize.h, cursor: 'crosshair', touchAction: 'none' }}>
              <canvas ref={canvasRef} style={{ width: displaySize.w, height: displaySize.h, borderRadius: 8, display: 'block' }} />
              {rect && (
                <>
                  <div style={{
                    position: 'absolute', left: rect.x1, top: rect.y1,
                    width: rect.x2 - rect.x1, height: rect.y2 - rect.y1,
                    border: '2px dashed #00c853', background: 'rgba(0,200,83,0.12)', boxSizing: 'border-box',
                  }} />
                  {[
                    [rect.x1, rect.y1], [(rect.x1 + rect.x2) / 2, rect.y1], [rect.x2, rect.y1],
                    [rect.x1, (rect.y1 + rect.y2) / 2], [rect.x2, (rect.y1 + rect.y2) / 2],
                    [rect.x1, rect.y2], [(rect.x1 + rect.x2) / 2, rect.y2], [rect.x2, rect.y2],
                  ].map(([hx, hy], i) => (
                    <div key={i} style={{
                      position: 'absolute', left: hx - HANDLE / 2, top: hy - HANDLE / 2,
                      width: HANDLE, height: HANDLE, background: '#00c853', border: '2px solid #fff',
                      borderRadius: 2, boxShadow: '0 0 2px rgba(0,0,0,0.5)',
                    }} />
                  ))}
                </>
              )}
            </div>
            <p style={{ fontSize: 12, color: '#888', margin: '8px 0' }}>
              드래그로 영역을 선택하고 모서리/변 핸들로 크기를 조절할 수 있습니다. 선택 없이도 전체 화면을 그대로 다운로드할 수 있어요.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={downloadRegion} style={btnPrimary}>선택 영역 다운로드</button>
              <button onClick={downloadFull} style={btnSecondary}>전체 화면 다운로드</button>
              <button onClick={retake} style={btnSecondary}>다시 캡처</button>
              <button onClick={stopShare} style={btnSecondary}>공유 중지</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 32, paddingTop: 16, borderTop: '1px solid #eee', fontSize: 13 }}>
          <a href="/" style={{ color: '#888', textDecoration: 'none' }}>← TVDB 홈</a>
        </div>
      </div>
    </>
  );
}

const btnPrimary = {
  padding: '10px 18px', borderRadius: 8, border: '1px solid #222', background: '#222',
  color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
};
const btnSecondary = {
  padding: '10px 18px', borderRadius: 8, border: '1px solid #ccc', background: '#fff',
  color: '#222', fontSize: 13.5, cursor: 'pointer',
};
