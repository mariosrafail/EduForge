import assert from "node:assert/strict";

export async function assertUnitExtrasModalLayout(dialog, { expectInnerScroll }) {
  const layout = await dialog.evaluate((element) => {
    const bounds = (target) => { const rect = target.getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; };
    const scroll = element.querySelector(".unit-extras-editor-scroll");
    const footer = element.querySelector(".unit-extras-editor > footer");
    const dialogStyle = getComputedStyle(element);
    return {
      viewport: { width: innerWidth, height: innerHeight }, dialog: bounds(element), footer: bounds(footer),
      dialogOverflow: { x: dialogStyle.overflowX, y: dialogStyle.overflowY, clientWidth: element.clientWidth, clientHeight: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight },
      inner: { ...bounds(scroll), clientWidth: scroll.clientWidth, clientHeight: scroll.clientHeight, scrollWidth: scroll.scrollWidth, scrollHeight: scroll.scrollHeight, overflowY: getComputedStyle(scroll).overflowY },
    };
  });
  assert.ok(layout.dialog.left >= -1 && layout.dialog.top >= -1 && layout.dialog.right <= layout.viewport.width + 1 && layout.dialog.bottom <= layout.viewport.height + 1, JSON.stringify(layout));
  assert.ok(layout.footer.left >= layout.dialog.left - 1 && layout.footer.right <= layout.dialog.right + 1 && layout.footer.top >= layout.dialog.top - 1 && layout.footer.bottom <= layout.dialog.bottom + 1, JSON.stringify(layout));
  assert.ok(layout.inner.scrollWidth <= layout.inner.clientWidth + 1, JSON.stringify(layout));
  assert.ok(layout.dialogOverflow.scrollWidth <= layout.dialogOverflow.clientWidth + 1 && layout.dialogOverflow.scrollHeight <= layout.dialogOverflow.clientHeight + 1, JSON.stringify(layout));
  assert.equal(layout.dialogOverflow.y, "hidden");
  assert.equal(layout.inner.overflowY, "auto");
  if (typeof expectInnerScroll === "boolean") assert.equal(layout.inner.scrollHeight > layout.inner.clientHeight + 1, expectInnerScroll, JSON.stringify(layout));
}
