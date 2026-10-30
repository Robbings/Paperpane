import assert from 'node:assert/strict';

/** Reused by the extension check and by a browser-tool replay of the built UI. */
export async function checkModelSettingsConcurrency(first, second, {
  modelId = 'local-model', reopen, observe = async () => {},
}) {
  const passed = [];
  const row = (page) => page.locator('.pp-model-row').filter({ hasText: modelId });
  const button = (page, name) => page.getByRole('button', { name, exact: true });
  const bar = (page) => page.getByRole('region', { name: '保存设置', exact: true });
  async function edit(page, fields = {}) {
    await row(page).getByRole('button', { name: '编辑', exact: true }).click();
    await observe(page);
    for (const [label, value] of Object.entries(fields)) await page.getByLabel(label, { exact: true }).fill(value);
    await observe(page);
  }
  async function finish(page) {
    await button(page, '完成').click();
    await observe(page);
  }
  async function save(page) {
    await bar(page).getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存', { exact: true }).waitFor({ state: 'visible' });
    await observe(page);
  }
  async function remote(fields) {
    await edit(second, fields); await finish(second); await save(second);
  }
  async function savedModel(page, name, capacity) {
    await reopen(page); await observe(page);
    await row(page).getByText(name, { exact: true }).waitFor({ state: 'visible' });
    await row(page).getByText(capacity, { exact: true }).waitFor({ state: 'visible' });
  }

  await edit(first, { '显示名称': 'Concurrency baseline', '上下文容量（tokens）': '64000' });
  await finish(first); await save(first);
  await reopen(second); await observe(second);

  // Original regression: the drawer's name edit must not overwrite remote 128K.
  await edit(first, { '显示名称': 'Local name' });
  await remote({ '上下文容量（tokens）': '128000' });
  assert.equal(await first.getByLabel('显示名称', { exact: true }).evaluate((el) => el.value), 'Local name');
  await finish(first);
  await bar(first).getByRole('button', { name: '保存', exact: true }).click();
  await button(first, '合并后保存').waitFor({ state: 'visible' }); await observe(first);
  await row(second).getByText('128K', { exact: true }).waitFor({ state: 'visible' });
  await button(first, '合并后保存').click();
  await first.getByText('已保存', { exact: true }).waitFor({ state: 'visible' }); await observe(first);
  await savedModel(first, 'Local name', '128K');
  await savedModel(second, 'Local name', '128K');
  passed.push('different fields survive merge and reload in both windows');

  // A real conflict must await the user's choice and keep unrelated changes.
  await edit(first, { '显示名称': 'Local conflict name' });
  await remote({ '显示名称': 'Remote conflict name', '上下文容量（tokens）': '192000' });
  await finish(first);
  await bar(first).getByRole('button', { name: '保存', exact: true }).click();
  await button(first, '用我的值保存').waitFor({ state: 'visible' }); await observe(first);
  assert.match(await bar(first).innerText(), /label/);
  await row(second).getByText('Remote conflict name', { exact: true }).waitFor({ state: 'visible' });
  await button(first, '用我的值保存').click();
  await first.getByText('已保存', { exact: true }).waitFor({ state: 'visible' }); await observe(first);
  await savedModel(first, 'Local conflict name', '192K');
  await savedModel(second, 'Local conflict name', '192K');
  passed.push('same-field conflict requires a choice and preserves remote capacity');

  // Cancelling must release the opening revision and immediately follow latest.
  await edit(first, { '显示名称': 'Cancelled name' });
  await remote({ '上下文容量（tokens）': '256000' });
  await button(first, '取消').click(); await observe(first);
  await row(first).getByText('256K', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await bar(first).getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  await savedModel(first, 'Local conflict name', '256K');
  passed.push('cancel preserves remote update and leaves no unsaved local draft');

  await edit(first);
  await remote({ '上下文容量（tokens）': '384000' });
  await finish(first);
  await row(first).getByText('384K', { exact: true }).waitFor({ state: 'visible' });
  assert.equal(await bar(first).getByRole('button', { name: '保存', exact: true }).isEnabled(), false);
  passed.push('completing an untouched drawer follows the latest settings');

  // Deletion is a conflict too: it must not silently resurrect the model.
  await edit(first, { '显示名称': 'Pending deletion conflict' });
  await row(second).getByRole('button', { name: '移除', exact: true }).click(); await observe(second);
  await button(second, '确认移除').click(); await observe(second); await save(second);
  await finish(first);
  await bar(first).getByRole('button', { name: '保存', exact: true }).click();
  await button(first, '放弃更改，载入最新').waitFor({ state: 'visible' }); await observe(first);
  assert.equal(await row(second).count(), 0);
  await button(first, '放弃更改，载入最新').click(); await observe(first);
  await reopen(first); await observe(first);
  assert.equal(await row(first).count(), 0);
  passed.push('remote deletion is explicit and reload does not restore the deleted model');
  return passed;
}
