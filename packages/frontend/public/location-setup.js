(function () {
  var params = new URLSearchParams(window.location.search);
  var uid = parseInt(params.get('uid') || '', 10);
  if (!uid || uid <= 0) return;

  document.getElementById('setup-panel').style.display = 'block';

  var btn = document.getElementById('locate-btn');
  var msg = document.getElementById('locate-msg');

  // If not on a secure origin, redirect to production where HTTPS is available
  var isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
  if (!isSecure) {
    btn.textContent = 'Open on wondereye.app';
    btn.addEventListener('click', function () {
      window.location.href = 'https://wondereye.app/?uid=' + uid;
    });
    return;
  }

  function saveLocation(lat, lng) {
    fetch('https://api.wondereye.app/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: uid, lat: lat, lng: lng }),
    }).then(function (res) {
      if (res.ok) {
        msg.textContent = 'Location saved! Restart Wondereye on your glasses.';
        msg.className = 'locate-msg success';
      } else {
        throw new Error('API error ' + res.status);
      }
    }).catch(function () {
      msg.textContent = 'Failed to save location. Please try again.';
      msg.className = 'locate-msg error';
      btn.disabled = false;
    });
  }

  function onSuccess(pos) {
    saveLocation(pos.coords.latitude, pos.coords.longitude);
  }

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);

  function showGeoError(err) {
    var text;
    if (err.code === 1) {
      if (isIOS) {
        text = 'Location access was blocked. On iPhone, go to Settings \u2192 Privacy & Security \u2192 Location Services \u2192 Safari and set it to "While Using". Also make sure Location Services is turned on at the top of that screen. If you\u2019re in Private Browsing, switch to a regular tab.';
      } else {
        text = 'Location access was blocked. Open your browser settings, allow location for this site, then try again.';
      }
    } else if (err.code === 2) {
      text = 'Could not determine your location. Please try again.';
    } else if (err.code === 3) {
      text = 'Location request timed out. Please try again.';
    } else {
      text = 'Could not get location: ' + err.message;
    }
    msg.textContent = text;
    msg.className = 'locate-msg error';
    btn.disabled = false;
  }

  btn.addEventListener('click', function () {
    if (!navigator.geolocation) {
      msg.textContent = 'Geolocation is not supported by this browser.';
      msg.className = 'locate-msg error';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Getting location...';
    msg.className = 'locate-msg';

    // Try GPS first (longer timeout for iOS Safari which needs more time),
    // fall back to Wi-Fi/cell positioning if GPS fails.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      function () {
        navigator.geolocation.getCurrentPosition(onSuccess, showGeoError, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 60000,
        });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 }
    );
  });
})();
