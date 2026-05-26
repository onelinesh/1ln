export function renderCopyButton(targetId: string): string {
  return `<button type="button" class="copy-btn" data-copy-target="${targetId}" aria-label="Copy" title="Copy">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
    <rect x="4" y="4" width="9" height="9" rx="1.5"/>
    <path d="M11 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h1"/>
  </svg>
</button>`;
}

export function copyButtonScript(): string {
  return `<script>
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".copy-btn");
  if (!btn) return;
  const targetId = btn.getAttribute("data-copy-target");
  const target = document.getElementById(targetId);
  if (!target) return;
  const text = target.dataset.copyValue ?? target.textContent ?? "";
  navigator.clipboard.writeText(text).then(() => {
    const prev = btn.innerHTML;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>';
    btn.classList.add("copied");
    setTimeout(() => { btn.innerHTML = prev; btn.classList.remove("copied"); }, 1500);
  });
});
</script>`;
}
