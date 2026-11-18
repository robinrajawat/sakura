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
    // Leave Cmd/Ctrl/Shift-click and middle-click to the browser (open in a new tab/window).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // Browsers only let a page close a tab that has no other history, so after moving between
    // the two pages just go to the app. close() can also be refused elsewhere (e.g. an installed
    // app's in-app browser); then fall back to the app as before.
    if (history.length > 1) return;
    e.preventDefault();
    window.close();
    setTimeout(function () { location.href = './'; }, 150);
  });
})();
