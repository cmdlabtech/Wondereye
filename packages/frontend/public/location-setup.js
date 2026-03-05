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

  btn.addEventListener('click', function () {
    if (!navigator.geolocation) {
      msg.textContent = 'Geolocation is not supported by this browser.';
      msg.className = 'locate-msg error';
      return;
    }
    btn.disabled = true;
    msg.textContent = 'Getting location...';
    msg.className = 'locate-msg';

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        var lat = pos.coords.latitude;
        var lng = pos.coords.longitude;
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
      },
      function (err) {
        msg.textContent = 'Could not get location: ' + err.message;
        msg.className = 'locate-msg error';
        btn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
})();
