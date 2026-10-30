// Retired integration URL: keep bookmarks, use the canonical reader entry.
const url = new URL('reader.html', location.href);
url.search = location.search;
url.hash = location.hash;
location.replace(url.href);
