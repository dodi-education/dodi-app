/**
 * The sandbox document every client loads a game bundle into: the bundle with
 * a locked-down CSP (no network at all) and the host shim (snapshot capture,
 * the `dodi.translate` runtime) injected ahead of the game's own scripts. The
 * web iframe, the screenshot service and the mobile WebView all render exactly
 * this document, so a game behaves the same everywhere it runs.
 */

export const SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; media-src 'none'; font-src 'none'";

/**
 * Inject the host shim before the first executable <script> so it runs first:
 * logs all incoming messages, answers `dodi:host_snapshot` with a capture of
 * the game surface (the dominant <canvas> when one covers the view, else a DOM
 * rasterization via SVG foreignObject), and provides the `dodi.translate`
 * runtime that resolves game text from the bundle's inert
 * `application/dodi-translations` block against the locale delivered in
 * `dodi:init`. Fully inline (CSP: no network) and game-cooperation-free.
 */
function injectHostShim(html: string): string {
  const shim = `<script>
(function(){
  function dominantCanvas(){
    var vw=window.innerWidth,vh=window.innerHeight;
    var list=document.querySelectorAll('canvas');
    var best=null,bestArea=0;
    for(var i=0;i<list.length;i++){
      var r=list[i].getBoundingClientRect();
      var area=r.width*r.height;
      if(area>bestArea){best=list[i];bestArea=area;}
    }
    // Only trust a canvas that actually IS the game surface, not a decoration.
    if(!best||bestArea<vw*vh*0.5)return null;
    return best;
  }
  function captureCanvas(){
    try{
      var c=dominantCanvas();
      if(!c||!c.width||!c.height)return null;
      return c.toDataURL('image/png');
    }catch(e){return null;}
  }
  function captureDom(done){
    try{
      var w=document.documentElement.clientWidth||window.innerWidth;
      var h=document.documentElement.clientHeight||window.innerHeight;
      if(!w||!h)return done(null);
      var clone=document.documentElement.cloneNode(true);
      var scripts=clone.querySelectorAll('script');
      for(var i=0;i<scripts.length;i++)scripts[i].parentNode.removeChild(scripts[i]);
      var xml=new XMLSerializer().serializeToString(clone);
      var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'">'
        +'<foreignObject width="100%" height="100%">'+xml+'</foreignObject></svg>';
      var img=new Image();
      img.onload=function(){
        try{
          var canvas=document.createElement('canvas');
          canvas.width=w;canvas.height=h;
          var ctx=canvas.getContext('2d');
          ctx.fillStyle='#ffffff';ctx.fillRect(0,0,w,h);
          ctx.drawImage(img,0,0);
          done(canvas.toDataURL('image/png'));
        }catch(e){done(null);}
      };
      img.onerror=function(){done(null);};
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    }catch(e){done(null);}
  }
  // ── dodi.translate runtime ─────────────────────────────────────────────
  // The translations block sits in <head>, so it is parsed before any game
  // script runs; games without one (legacy) simply get the key back.
  var i18nData=null,i18nParsed=false,activeLocale=null;
  function i18nLoad(){
    if(i18nParsed)return i18nData;
    var el=document.querySelector('script[type="application/dodi-translations"]');
    if(!el)return null; // not in the DOM yet (or legacy game) — retry on next call
    i18nParsed=true;
    try{i18nData=JSON.parse(el.textContent||'');}
    catch(err){console.warn('[iframe-shim] invalid translations block',err);}
    return i18nData;
  }
  function i18nDict(data,locale){
    if(!locale||!data.locales)return null;
    var loc=String(locale).toLowerCase();
    return data.locales[loc]||data.locales[loc.slice(0,2)]||null;
  }
  window.dodi=window.dodi||{};
  window.dodi.translate=function(key,params){
    var data=i18nLoad();
    var text=null;
    if(data&&data.locales){
      var dict=i18nDict(data,activeLocale)||data.locales[data.sourceLocale];
      if(dict&&Object.prototype.hasOwnProperty.call(dict,key))text=dict[key];
      else{
        var src=data.locales[data.sourceLocale];
        if(src&&Object.prototype.hasOwnProperty.call(src,key))text=src[key];
      }
    }
    if(text==null)text=key;
    if(params)text=String(text).replace(/\\{(\\w+)\\}/g,function(m,p){
      return Object.prototype.hasOwnProperty.call(params,p)?String(params[p]):m;
    });
    return text;
  };
  window.addEventListener('message',function(e){
    var d=e.data;
    if(!d||typeof d!=='object'||typeof d.type!=='string')return;
    console.log('[iframe-shim] IN: '+d.type,d);
    // This listener registers before any game script, so the locale is set
    // before the game's own dodi:init handler renders its first frame. Locale
    // is fixed at init — a mid-session UI language switch remounts the iframe.
    if(d.type==='dodi:init'&&d.payload&&typeof d.payload.locale==='string'){
      activeLocale=d.payload.locale;
    }
    if(d.type!=='dodi:host_snapshot')return;
    var reply=function(snapshot){
      parent.postMessage({type:'game:event',token:d.token,payload:{event:'host_snapshot',snapshot:snapshot}},'*');
    };
    var fromCanvas=captureCanvas();
    if(fromCanvas)return reply(fromCanvas);
    captureDom(reply);
  });
  // Outgoing messages can't be logged from inside the sandbox: it's origin "null",
  // so reassigning the cross-origin parent.postMessage throws a SecurityError. The
  // host logs the messages it receives instead (see GameSandbox onMessage).
  console.log('[iframe-shim] shim active');
})();
</script>`;
  // Insert before the first EXECUTABLE <script> so the shim runs first. Inert
  // data blocks (type="application/…", e.g. the translations block) are not
  // executed and must not pull the shim ahead of themselves into <head>.
  const executable = html.match(/<script\b(?![^>]*\btype\s*=\s*["']application\/)/i);
  if (executable?.index !== undefined) {
    return html.slice(0, executable.index) + shim + html.slice(executable.index);
  }
  return html + shim;
}

export function buildSandboxSrcDoc(codeBundle: string): string {
  const cspMeta = `<meta http-equiv=\"Content-Security-Policy\" content=\"${SANDBOX_CSP}\" />`;

  let doc: string;
  if (/content-security-policy/i.test(codeBundle)) {
    doc = codeBundle;
  } else if (/<head[^>]*>/i.test(codeBundle)) {
    doc = codeBundle.replace(/<head[^>]*>/i, (match) => `${match}${cspMeta}`);
  } else {
    doc = [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      cspMeta,
      "</head>",
      "<body>",
      codeBundle,
      "</body>",
      "</html>",
    ].join("\n");
  }

  return injectHostShim(doc);
}
