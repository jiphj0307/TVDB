import { useEffect, useMemo, useRef } from 'react';
import { SLOT_BANNER_SIZE } from '../lib/adSlotSizes';
import { useCoupangWidgets } from '../lib/AdSlotsContext';

// (프레시시즌 components/AdSlot.js를 TVDB용 경로로 그대로 이식 — 로직 동일)

function AdBadge({ number, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: '50%', background: '#e63946', color: '#fff', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{number}</span>
      <span style={{ fontSize: 10, color: '#666', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function useInjectAdCode(containerRef, code, deps = []) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !code) return;
    el.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.innerHTML = code;
    Array.from(wrapper.querySelectorAll('script')).forEach(oldScript => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });
    el.appendChild(wrapper);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function pickCoupangBanner(widgets, size) {
  if (!size) return null;
  const matches = (Array.isArray(widgets) ? widgets : []).filter(w => w.enabled && w.widget_html && w.size === size);
  if (matches.length === 0) return null;
  return matches[Math.floor(Math.random() * matches.length)];
}

function useResolvedAdContent(slot, slotData) {
  const coupangWidgets = useCoupangWidgets();
  const size = SLOT_BANNER_SIZE[slot];
  const coupangBanner = useMemo(() => pickCoupangBanner(coupangWidgets, size), [coupangWidgets, size]);

  const source = slotData?.source || 'adsense';
  const hasAdsense = !!(slotData?.active && slotData?.code);
  const hasCoupang = !!(slotData?.active && coupangBanner);

  let injectHtml = null;
  if (slotData?.active) {
    if (source === 'coupang') {
      injectHtml = hasCoupang ? coupangBanner.widget_html : null;
    } else if (source === 'random') {
      const pool = [];
      if (hasAdsense) pool.push(slotData.code);
      if (hasCoupang) pool.push(coupangBanner.widget_html);
      injectHtml = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    } else {
      injectHtml = hasAdsense ? slotData.code : null;
    }
  }

  return {
    injectHtml,
    isOff: !!(slotData && !slotData.active),
    isWaiting: !!(slotData?.active && !injectHtml),
  };
}

export function AdSlot({ slot, label = '광고', number, slotData = null, style: extraStyle = {} }) {
  const codeRef = useRef(null);
  const { injectHtml, isOff, isWaiting } = useResolvedAdContent(slot, slotData);
  useInjectAdCode(codeRef, injectHtml, [injectHtml]);

  if (isOff) return null;

  if (injectHtml) return (
    <div style={{ ...extraStyle, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {number && <AdBadge number={number} label={label} />}
      <div ref={codeRef} style={{ maxWidth: '100%' }} />
    </div>
  );

  if (isWaiting) return (
    <div style={{ ...extraStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 60, background: '#f5f9f5', border: '1px dashed #d1e8d1', borderRadius: 8, color: '#8aaa8a', fontSize: 12 }}>
      {number && <AdBadge number={number} label={label} />}
      <span style={{ fontSize: 18 }}>📢</span>
      <span>{label} 영역</span>
    </div>
  );

  return null;
}
