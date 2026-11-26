(() => {
  try {
    const visible = element => {
      if (!element || !element.isConnected) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 8 && rect.height > 8;
    };
    const disabled = element => element.disabled || element.getAttribute('aria-disabled') === 'true' ||
      /disabled/.test(String(element.className || '').toLowerCase());
    const controls = Array.from(document.querySelectorAll('button,[role="button"],a'));
    const next = controls.find(element => {
      if (!visible(element) || disabled(element)) return false;
      const text = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
      const label = String(element.getAttribute('aria-label') || element.getAttribute('title') || '').trim();
      const classes = String(element.className || '');
      if (/上一页|previous|prev/i.test(text + ' ' + label + ' ' + classes)) return false;
      return /^(?:下一页|下页|next|›|>|»)$|下一页|pagination-next|page-next|\bnext\b/i.test(text + ' ' + label + ' ' + classes);
    });
    if (!next) return JSON.stringify({ clicked: false, reason: '没有找到下一页按钮' });
    next.scrollIntoView({ block: 'center', inline: 'nearest' });
    next.click();
    return JSON.stringify({ clicked: true, reason: '' });
  } catch (error) {
    return JSON.stringify({ clicked: false, reason: String(error && error.message || error) });
  }
})()
