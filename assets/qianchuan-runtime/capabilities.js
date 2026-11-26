(() => {
  if (window.__cbQcModules && window.__cbQcModules.version === 1) return window.__cbQcModules.check();
  const text = f => { try { return Function.prototype.toString.call(f); } catch (_) { return ''; } };
  let runtime = null, chunk = '', ids = {}, functions = {};
  function discover() {
    if (runtime) return runtime;
    for (const key of Object.keys(window)) {
      if (!Array.isArray(window[key]) || !/webpack|qianchuan|qc-main/i.test(key)) continue;
      try { window[key].push([['cb_capability_' + Date.now()], {}, r => { runtime = r; chunk = key; }]); } catch (_) {}
      if (runtime && runtime.m) return runtime;
    }
    return null;
  }
  const signatures = {
    request: s => /qc-sid/.test(s) && /X-CSRFToken/.test(s) && /originAjax/.test(s),
    upload: s => /upload/i.test(s) && /image|material|video|Filedata/i.test(s),
    wrapper: s => /needCaptureError/.test(s) && /axiosConfig/.test(s)
  };
  const hints = { request: '273641', upload: '821544', wrapper: '19193' };
  function moduleId(role) {
    const r = discover(); if (!r || !signatures[role]) return '';
    if (ids[role] && r.m[ids[role]] && signatures[role](text(r.m[ids[role]]))) return ids[role];
    const candidates = [hints[role], ...Object.keys(r.m || {}).filter(k => k !== hints[role])];
    for (const id of candidates) if (r.m[id] && signatures[role](text(r.m[id]))) return ids[role] = id;
    return '';
  }
  function pick(role, fingerprint) {
    const r = discover(), id = moduleId(role); if (!r || !id) return null;
    let exports; try { exports = r(id); } catch (_) { return null; }
    const values = typeof exports === 'function' ? [exports] : Object.keys(exports || {}).map(k => exports[k]);
    const matches = values.filter(f => typeof f === 'function' && fingerprint(text(f)));
    return matches.length === 1 ? matches[0] : null;
  }
  const api = {
    version: 1, runtime: discover, moduleId,
    request: () => pick('request', s => /originAjax/.test(s) && /POST/.test(s)),
    upload: () => ({
      lG: pick('upload', s => /upload-image-normal/.test(s)),
      FV: pick('upload', s => /upload-image/.test(s) && !/upload-image-normal/.test(s))
    }),
    wrapper: () => ({ hj: pick('wrapper', s => /needCaptureError|axiosConfig/.test(s)) }),
    check: () => {
      discover(); const upload = api.upload();
      return { ordinaryRead: typeof fetch === 'function' && location.protocol === 'https:' && location.hostname === 'qianchuan.jinritemai.com',
        officialRequest: !!api.request(), requestWrapper: !!api.wrapper().hj, imageUpload: !!upload.FV, fileUpload: !!upload.lG,
        chunk, frontVersion: (chunk.match(/(?:qc-main[^:]*:|gfversion[=:])([0-9.]+)/) || [])[1] || '',
        modules: { request: moduleId('request'), upload: moduleId('upload'), wrapper: moduleId('wrapper') } };
    }
  };
  window.__cbQcModules = api;
  return api.check();
})()
