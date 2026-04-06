var _setupUrl = '';

document.addEventListener('DOMContentLoaded', function () {
  var setupUrl = document.getElementById('setup-url');
  if (setupUrl) setupUrl.addEventListener('click', function () { copyUrl(this); });
});

function copyUrl(el) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(_setupUrl).then(function () {
      showCopied(el);
    }).catch(function () { fallbackCopy(el); });
  } else {
    fallbackCopy(el);
  }
}

function fallbackCopy(el) {
  var range = document.createRange();
  range.selectNodeContents(el);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    document.execCommand('copy');
    showCopied(el);
  } catch (e) {
    // selection remains so user can copy manually
  }
}

function showCopied(el) {
  el.classList.add('copied');
  setTimeout(function () { el.classList.remove('copied'); }, 1500);
}
