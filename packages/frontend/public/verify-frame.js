// See verify-frame.html. Only a parent page that /_headers lets embed this
// frame (frame-ancestors) and whose origin matches PARENT can receive a token:
// postMessage is sent to that exact origin, so the browser drops it otherwise.
(function () {
  var SITEKEY = '0x4AAAAAAFQyWWYVPcIJm6E7'; // public Turnstile sitekey
  var PARENT = /^(https:\/\/wondereye\.app|http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?)$/;
  var params = new URLSearchParams(location.search);
  var anc = location.ancestorOrigins;
  var parentOrigin = anc && anc.length ? anc[0] : params.get('parent') || '';
  if (window.parent === window || !PARENT.test(parentOrigin)) return;

  var lang = params.get('lang') || 'auto';
  if (!/^(auto|[a-z]{2}(-[a-z]{2})?)$/.test(lang)) lang = 'auto';
  var widgetId;

  function post(msg) {
    msg.source = 'wondereye-verify';
    window.parent.postMessage(msg, parentOrigin);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== parentOrigin) return;
    var d = e.data || {};
    if (d.source === 'wondereye-verify' && d.cmd === 'reset' && window.turnstile && widgetId) window.turnstile.reset(widgetId);
  });

  var s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true;
  s.onerror = function () { post({ event: 'error', code: 'load' }); };
  s.onload = function () {
    if (!window.turnstile) return post({ event: 'error', code: 'load' });
    widgetId = window.turnstile.render(document.getElementById('ts'), {
      sitekey: SITEKEY,
      theme: 'dark',
      size: 'flexible',
      action: 'feedback',
      language: lang,
      callback: function (t) { post({ event: 'token', token: t }); },
      'expired-callback': function () { post({ event: 'expired' }); },
      'error-callback': function (code) { post({ event: 'error', code: String(code) }); },
    });
    post({ event: 'ready' });
  };
  document.head.appendChild(s);
})();
