/* Privacy policy and terms pages. When the app opens one (its links add ?from=app, in a new tab),
   "Back to Sakura Notes" closes this tab, so people return to the app they came from instead of
   opening a second copy of it. Arriving directly (search, a shared link), the link goes home.
   Same-origin and loads nothing else: a plain visit still reaches no third party. */
(function () {
  if (new URLSearchParams(location.search).get('from') !== 'app') return;
  // Keep the flag when moving between the two pages, so Back behaves the same on both.
  document.querySelectorAll('a[href="privacy.html"], a[href="terms.html"]').forEach(function (a) {
    a.setAttribute('href', a.getAttribute('href') + '?from=app');
  });
  var back = document.querySelector('.back a');
  if (!back) return;
  back.addEventListener('click', function (e) {
    e.preventDefault();
    window.close();
    // Browsers refuse close() in some cases (e.g. after moving between the pages, or in an
    // installed app's in-app browser); then fall back to the app as before.
    setTimeout(function () { location.href = './'; }, 150);
  });
})();
