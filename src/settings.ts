import { invoke } from '@tauri-apps/api/core';

export function initSettingsPanel(): void {
  const btn = document.querySelector<HTMLButtonElement>('#settings-btn');
  const panel = document.querySelector<HTMLDivElement>('#settings-panel');
  const input = document.querySelector<HTMLInputElement>('#shortcut-input');
  const saveBtn = document.querySelector<HTMLButtonElement>('#shortcut-save');
  const closeBtn = document.querySelector<HTMLButtonElement>('#settings-close');
  const status = document.querySelector<HTMLParagraphElement>('#shortcut-status');
  if (!btn || !panel || !input || !saveBtn || !closeBtn || !status) return;

  btn.addEventListener('click', async () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      status.textContent = '';
      input.value = await invoke<string>('get_shortcut');
    }
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.add('hidden');
  });

  saveBtn.addEventListener('click', async () => {
    status.textContent = '';
    try {
      await invoke('set_shortcut', { shortcut: input.value.trim() });
      status.textContent = 'Guardado.';
      status.classList.remove('error');
    } catch (err) {
      status.textContent = String(err);
      status.classList.add('error');
    }
  });
}
