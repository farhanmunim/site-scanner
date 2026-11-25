(function () {
  try {
    var t = localStorage.getItem('ss-theme');
    if (/[?&]print=1(&|$)/.test(location.search)) t = 'light';
    // Light for every first visit (scanner, admin and archive alike); dark only once the visitor picks it.
    if (t !== 'dark') t = 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch (e) {}
})();
