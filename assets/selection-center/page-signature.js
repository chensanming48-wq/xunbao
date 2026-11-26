(() => {
  try {
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const activePage = normalize((document.querySelector('[aria-current="page"],.ant-pagination-item-active,.semi-page-item-active,[class*="pagination"] [class*="active"]') || {}).innerText);
    const candidates = Array.from(document.querySelectorAll('tbody tr,[role="row"][aria-rowindex],[data-row-key],[data-testid*="product-item"],[data-testid*="goods-item"],[class*="product-card"],[class*="goods-card"]'));
    const firstRow = candidates.find(row => {
      const text = normalize(row && (row.innerText || row.textContent));
      const id = row && (row.getAttribute('data-row-key') || row.getAttribute('data-product-id') || row.getAttribute('data-goods-id'));
      const link = row && row.querySelector('a[href*="product"],a[href*="goods"],a[href*="commodity"],a[href*="item"]');
      const image = row && row.querySelector('img');
      return text.length >= 8 && (id || link || (image && /[¥￥]\s*[\d,.]+/.test(text)));
    });
    const firstText = normalize(firstRow && (firstRow.innerText || firstRow.textContent)).slice(0, 400);
    let hash = 2166136261;
    const source = String(location.href || '') + '|' + activePage + '|' + firstText;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return activePage + '|' + (hash >>> 0).toString(16);
  } catch (_error) {
    return String(Date.now());
  }
})()
