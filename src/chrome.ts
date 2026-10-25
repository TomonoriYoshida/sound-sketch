// キャンバスのページの、上のバーと設定パネルの開閉。
// 「⚙ 設定」で開閉し、Esc でも閉じる。パネルを開いたままでもキャンバスで演奏できる

export function setupChrome() {
  const toggle = document.querySelector<HTMLButtonElement>("#settings-toggle")!;
  const panel = document.querySelector<HTMLElement>("#settings")!;

  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => setOpen(panel.hidden));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
}
