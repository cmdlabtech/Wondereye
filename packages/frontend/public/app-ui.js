var _setupUrl = '';

document.addEventListener('DOMContentLoaded', function () {
  var copyBtn = document.getElementById('copy-btn');
  var setupUrl = document.getElementById('setup-url');
  if (copyBtn) copyBtn.addEventListener('click', copyUrl);
  if (setupUrl) setupUrl.addEventListener('click', function () { selectUrl(this); });
});

function selectUrl(el) {
  var range = document.createRange();
  range.selectNodeContents(el);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function copyUrl() {
  var btn = document.getElementById('copy-btn');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(_setupUrl).then(function () {
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = 'Copy Link'; }, 2000);
    }).catch(function () { fallbackCopy(btn); });
  } else {
    fallbackCopy(btn);
  }
}

function fallbackCopy(btn) {
  selectUrl(document.getElementById('setup-url'));
  try {
    document.execCommand('copy');
    btn.textContent = 'Copied!';
    setTimeout(function () { btn.textContent = 'Copy Link'; }, 2000);
  } catch (e) {
    btn.textContent = 'Select text above to copy';
  }
}
