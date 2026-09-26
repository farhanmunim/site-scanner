(function () {
  try {
    var t = localStorage.getItem('ss-theme');
    if (/[?&]print=1(&|$)/.test(location.search)) t = 'light';
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
