/*
  HEIC -> JPEG conversion on upload, no user steps. iPhones hand the picker
  HEIC originals (quality/transcode flags are unreliable with PHPicker), and
  browsers/emails/Facebook can't render HEIC. The app binary has no image
  codec module, but it DOES ship react-native-webview - and on iOS the
  system WebKit decodes HEIC natively. So: invisible WebView, draw the
  image on a canvas, re-encode as JPEG, hand the base64 back.

  Usage: render <HeicConverterHost /> once on the uploading screen, then
  `await convertIfHeic(base64)` per image. Non-HEIC returns untouched;
  failures return the original so uploads never block on the converter.
*/
import React, { useRef, useEffect } from 'react';
import { View } from 'react-native';

let WebViewComp: any = null;
try { WebViewComp = require('react-native-webview').WebView; } catch {}

export function isHeicBase64(b64?: string | null): boolean {
  if (!b64 || b64.length < 24) return false;
  try {
    const head = (globalThis as any).atob ? (globalThis as any).atob(b64.slice(0, 32)) : '';
    return head.includes('ftypheic') || head.includes('ftypheif') || head.includes('ftypmif1') || head.includes('ftyphevc');
  } catch { return false; }
}

type Pending = { resolve: (b64: string) => void; original: string; timer: any };
const state: { webview: any; queue: Pending[]; active: Pending | null } = { webview: null, queue: [], active: null };

const PAGE = `<!doctype html><html><body><script>
function send(m){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(m); }
window.convertHeic = function(b64){
  try {
    var img = new Image();
    img.onload = function(){
      try {
        var MAX = 2048;
        var w = img.naturalWidth, h = img.naturalHeight;
        if (!w || !h) { send('ERR'); return; }
        var scale = Math.min(1, MAX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var out = c.toDataURL('image/jpeg', 0.82);
        send(out.indexOf(',') > 0 ? out.split(',')[1] : 'ERR');
      } catch (e) { send('ERR'); }
    };
    img.onerror = function(){ send('ERR'); };
    img.src = 'data:image/heic;base64,' + b64;
  } catch (e) { send('ERR'); }
};
send('READY');
</script></body></html>`;

function pump() {
  if (state.active || !state.webview || state.queue.length === 0) return;
  const job = state.queue.shift()!;
  state.active = job;
  // 20s safety: a stuck conversion falls back to the original bytes
  job.timer = setTimeout(() => { if (state.active === job) { state.active = null; job.resolve(job.original); pump(); } }, 20000);
  state.webview.injectJavaScript(`window.convertHeic(${JSON.stringify(job.original)}); true;`);
}

export function convertIfHeic(b64: string): Promise<string> {
  if (!isHeicBase64(b64) || !WebViewComp) return Promise.resolve(b64);
  return new Promise(resolve => {
    state.queue.push({ resolve, original: b64, timer: null });
    pump();
  });
}

export function HeicConverterHost() {
  const ref = useRef<any>(null);
  useEffect(() => () => { if (state.webview === ref.current) state.webview = null; }, []);
  if (!WebViewComp) return null;
  return (
    <View style={{ width: 1, height: 1, opacity: 0, position: 'absolute' }} pointerEvents="none">
      <WebViewComp
        ref={(r: any) => { ref.current = r; if (r) { state.webview = r; } }}
        source={{ html: PAGE }}
        onMessage={(e: any) => {
          const msg = String(e?.nativeEvent?.data || '');
          if (msg === 'READY') { pump(); return; }
          const job = state.active;
          if (!job) return;
          clearTimeout(job.timer);
          state.active = null;
          job.resolve(msg && msg !== 'ERR' && msg.length > 100 ? msg : job.original);
          pump();
        }}
        javaScriptEnabled
        originWhitelist={['*']}
      />
    </View>
  );
}
