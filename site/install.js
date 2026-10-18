// Download link and version come from config.js (updated when a new APK is published).
// A file of its own, not inline: the page's Content-Security-Policy allows scripts from this
// site only (site/security-headers.conf).
(function () {
  var cfg = window.FFT_APK || {};
  var a = document.getElementById('download');
  if (cfg.url) a.href = cfg.url;
  if (cfg.version)
    document.getElementById('version').textContent =
      'Android · APK · v' + cfg.version + (cfg.size ? ' · ' + cfg.size : '');
})();
