import { type L, onLangChange, t } from "./i18n";

// 地域などの見出し（optgroup）付きのプルダウンに選択肢を足し、言語を切り替えたら選択はそのままで表示名だけ書き換える。
// group は日本語のまま識別子として使い、表示名は groupNames から引く
export function fillGroupedSelect(
  selectEl: HTMLSelectElement,
  items: { value: string; group: string; name: L }[],
  groupNames: Record<string, L>,
) {
  const optgroups = new Map<string, HTMLOptGroupElement>();
  const options: [HTMLOptionElement, L][] = [];
  for (const item of items) {
    let optgroup = optgroups.get(item.group);
    if (!optgroup) {
      optgroup = document.createElement("optgroup");
      optgroups.set(item.group, optgroup);
      selectEl.append(optgroup);
    }
    const option = new Option("", item.value);
    optgroup.append(option);
    options.push([option, item.name]);
  }

  const render = () => {
    for (const [group, optgroup] of optgroups) optgroup.label = t(groupNames[group]);
    for (const [option, name] of options) option.text = t(name);
  };
  render();
  onLangChange(render);
}
