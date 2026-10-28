(function () {
  try {
    var t = localStorage.getItem('ss-theme');
    if (/[?&]print=1(&|$)/.test(location.search)) t = 'light';
    // The scanner UI is dark by default; the admin console and archived design follow the system unless the visitor chose.
    var classic = /^\/(admin|archive)(\/|$)/.test(location.pathname);
    if (t !== 'dark' && t !== 'light' && !classic) t = 'dark';
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
