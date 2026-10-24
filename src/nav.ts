// ナビのリンクに今のクエリ (?scale=…&root=…) を付け、ページを移っても設定を引き継ぐ
export function syncNavQuery() {
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".nav a")) {
    const url = new URL(a.href);
    url.search = location.search;
    a.href = url.toString();
  }
}
