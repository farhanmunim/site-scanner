(function () {
  try {
    var t = localStorage.getItem('ss-theme');
    if (/[?&]print=1(&|$)/.test(location.search)) t = 'light';
    // The scanner UI and admin console are dark by default; the archived design follows the system unless the visitor chose.
    var classic = /^\/archive(\/|$)/.test(location.pathname);
    if (t !== 'dark' && t !== 'light' && !classic) t = 'dark';
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
