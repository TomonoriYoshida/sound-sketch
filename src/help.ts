import "./help.css";
import { HELP_BY_PAGE, HELP_COMMON, type HelpText } from "./help-texts";

// 「説明」スイッチ。オンの間、ホバーできる端末ではコントロールにホバー（またはキーボードでフォーカス）すると吹き出しで、
// タッチ端末では各コントロールの横の「?」をタップすると画面下から説明を出す。オンオフはブラウザに保存する

const STORAGE_KEY = "sound-sketch:help";

function pageId(): string {
  const name = location.pathname.split("/").pop() ?? "";
  return name === "" || name === "index.html" ? "keyboard" : name.replace(/\.html$/, "");
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

function saveEnabled(on: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // 保存できない環境では、ページを開くたびにオフから始まるだけ
  }
}

function fillContent(container: HTMLElement, help: HelpText) {
  const title = document.createElement("strong");
  title.textContent = help.title;
  const text = document.createElement("p");
  text.textContent = help.text;
  container.replaceChildren(title, text);
}

export function setupHelp() {
  const texts = { ...HELP_COMMON, ...HELP_BY_PAGE[pageId()] };
  // input や select はラベルごと対象にする
  const targets: [HTMLElement, HelpText][] = [];
  for (const [selector, help] of Object.entries(texts)) {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) continue;
    const target = el.closest("label") ?? el;
    target.dataset.helpTarget = "";
    targets.push([target, help]);
  }

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "help-toggle";
  toggle.textContent = "? 説明";
  // キャンバスのページではバーの右側、Keyboard ではナビの並びに置く
  (document.querySelector(".bar-actions") ?? document.querySelector(".nav")!).append(toggle);

  const isOn = () => document.body.classList.contains("help-on");
  let hide = () => {};

  if (matchMedia("(hover: hover)").matches) {
    const popover = document.createElement("div");
    popover.className = "help-popover";
    popover.setAttribute("role", "tooltip");
    document.body.append(popover);

    const show = (el: HTMLElement, help: HelpText) => {
      if (!isOn()) return;
      fillContent(popover, help);
      popover.classList.add("open");
      // 対象の下に出し、画面からはみ出すときは左右を寄せる。下に入らなければ上に出す
      const rect = el.getBoundingClientRect();
      const left = Math.min(Math.max(rect.left, 8), window.innerWidth - popover.offsetWidth - 8);
      const below = rect.bottom + 8;
      const top = below + popover.offsetHeight > window.innerHeight ? rect.top - popover.offsetHeight - 8 : below;
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    hide = () => popover.classList.remove("open");

    for (const [el, help] of targets) {
      el.addEventListener("mouseenter", () => show(el, help));
      el.addEventListener("mouseleave", hide);
      el.addEventListener("focusin", () => show(el, help));
      el.addEventListener("focusout", hide);
    }
  } else {
    const backdrop = document.createElement("div");
    backdrop.className = "help-backdrop";
    const sheet = document.createElement("div");
    sheet.className = "help-sheet";
    sheet.setAttribute("role", "dialog");
    const content = document.createElement("div");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "help-sheet-close";
    close.textContent = "閉じる";
    sheet.append(content, close);
    document.body.append(backdrop, sheet);

    const open = (help: HelpText) => {
      fillContent(content, help);
      backdrop.classList.add("open");
      sheet.classList.add("open");
    };
    hide = () => {
      backdrop.classList.remove("open");
      sheet.classList.remove("open");
    };
    backdrop.addEventListener("click", hide);
    close.addEventListener("click", hide);

    // 下にスワイプしても閉じる
    let startY: number | null = null;
    sheet.addEventListener("pointerdown", (e) => (startY = e.clientY));
    sheet.addEventListener("pointerup", (e) => {
      if (startY !== null && e.clientY - startY > 50) hide();
      startY = null;
    });

    for (const [el, help] of targets) {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "help-badge";
      badge.textContent = "?";
      badge.setAttribute("aria-label", `${help.title}の説明`);
      badge.addEventListener("click", () => open(help));
      el.after(badge);
    }
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });

  const setEnabled = (on: boolean) => {
    document.body.classList.toggle("help-on", on);
    toggle.setAttribute("aria-pressed", String(on));
    saveEnabled(on);
    if (!on) hide();
  };
  toggle.addEventListener("click", () => setEnabled(!isOn()));
  setEnabled(loadEnabled());
}
