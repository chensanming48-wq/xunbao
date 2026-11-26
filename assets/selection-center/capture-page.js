(() => {
  try {
    const maxItems = 200;
    const normalize = value => String(value || '').replace(/\s+/g, ' ').trim();
    const visible = element => {
      if (!element || !element.isConnected) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 20 && rect.height > 12;
    };
    const ignoredExact = new Set([
      '商品', '商品列表', '商品名称', '商品信息', '商品类目', '店铺名称', '达人', '视频', '直播',
      '排名', '操作', '查看详情', '加入追踪', '全部', '不限', '搜索', '筛选', '重置', '导出',
      '品牌类型', '知名品牌', '非知名品牌', '用户支付金额', '点击次数', '成交件数',
      '点击成交转化率', '价格带', '基础数据', '流量分析', '商品机会', '商品榜单'
    ]);
    const ignoredPattern = /^(?:排名\s*)?(?:商品|店铺名称|用户支付金额|点击次数|成交件数|点击成交转化率|操作)(?:\s+(?:商品|店铺名称|用户支付金额|点击次数|成交件数|点击成交转化率|操作))*$/;
    const validTitle = value => {
      const title = normalize(value);
      if (title.length < 5 || title.length > 180 || ignoredExact.has(title) || ignoredPattern.test(title)) return false;
      if (/^(?:不限|全部|近\d+天|成交TOP\d+|流量高转化低|仅看|品牌类型)(?:\s|$)/.test(title)) return false;
      if (/^[\d\s.,%¥￥万千百+-]+$/.test(title)) return false;
      if (!/[\u3400-\u9fffA-Za-z]/.test(title)) return false;
      return true;
    };
    const firstValidTitle = values => {
      for (const value of values) {
        const normalized = normalize(value);
        if (validTitle(normalized)) return normalized;
      }
      return '';
    };
    const attr = (element, names) => {
      for (const name of names) {
        const value = element && element.getAttribute ? normalize(element.getAttribute(name)) : '';
        if (value) return value;
      }
      return '';
    };
    const fnv = value => {
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    };
    const findLink = row => {
      const anchors = Array.from(row.querySelectorAll('a[href]'));
      const preferred = anchors.find(anchor => /product|goods|commodity|promotion|item|detail|video/i.test(anchor.href || ''));
      const chosen = preferred || anchors[0] || (row.closest && row.closest('a[href]'));
      return chosen && chosen.href ? String(chosen.href) : '';
    };
    const findId = (row, href, text, attributeNames, queryKeys, pathPattern, textPattern) => {
      const direct = attr(row, attributeNames);
      if (direct && /\d{5,}/.test(direct)) return (direct.match(/\d{5,}/) || [direct])[0];
      if (href) {
        try {
          const url = new URL(href, location.href);
          for (const key of queryKeys) {
            const value = normalize(url.searchParams.get(key));
            if (/^\d{5,}$/.test(value)) return value;
          }
          const pathId = (url.pathname || '').match(pathPattern);
          if (pathId) return pathId[1];
        } catch (_error) {}
      }
      const textId = text.match(textPattern);
      return textId ? textId[1] : '';
    };
    const findProductId = (row, href, text) => findId(
      row,
      href,
      text,
      ['data-product-id', 'data-productid', 'data-goods-id', 'data-goodsid', 'data-commodity-id', 'data-promotion-id', 'data-item-id'],
      ['product_id', 'productId', 'goods_id', 'goodsId', 'commodity_id', 'promotion_id', 'item_id', 'itemId'],
      /(?:product|goods|commodity|promotion|item)\/(\d{5,})/i,
      /(?:商品|货品|推广)\s*ID\s*[:：]?\s*(\d{5,})/i
    );
    const findVideoId = (row, href, text) => findId(
      row,
      href,
      text,
      ['data-video-id', 'data-videoid', 'data-aweme-id', 'data-awemeid', 'data-content-id', 'data-photo-id'],
      ['aweme_id', 'awemeId', 'video_id', 'videoId', 'content_id', 'contentId', 'photoId'],
      /(?:video|aweme|content|photo)\/(\d{5,})/i,
      /(?:视频|作品|内容)\s*ID\s*[:：]?\s*(\d{5,})/i
    );
    const findPrice = text => {
      const labelled = text.match(/(?:到手价|商品价格|售价|价格)\s*[:：]?\s*([¥￥]\s*)?([\d,.]+)(?:\s*[-~至]\s*([¥￥]\s*)?([\d,.]+))?/);
      if (labelled) {
        const lower = normalize(labelled[2]);
        const upper = normalize(labelled[4]);
        return upper ? `¥${lower} - ¥${upper}` : `¥${lower}`;
      }
      const tokens = Array.from(text.matchAll(/[¥￥]\s*([\d,.]+)(?!\s*[%万])/g));
      if (tokens.length !== 1) return '';
      return `¥${normalize(tokens[0][1])}`;
    };
    const findTextFromSelectors = (row, selectors) => {
      const values = [];
      for (const selector of selectors) {
        for (const element of Array.from(row.querySelectorAll(selector)).slice(0, 20)) {
          values.push(attr(element, ['title', 'aria-label', 'data-title']));
          values.push(element.innerText || element.textContent || '');
        }
      }
      return firstValidTitle(values);
    };
    const findTitle = (row, rawText) => {
      const targeted = findTextFromSelectors(row, [
        '[data-testid*="product-name"]', '[data-testid*="goods-name"]', '[data-testid*="commodity-name"]',
        '[class*="productName"]', '[class*="product-name"]', '[class*="goodsName"]', '[class*="goods-name"]',
        '[class*="commodityName"]', '[class*="commodity-name"]', '[class*="itemName"]', '[class*="item-name"]',
        '[class*="title"]', 'a[title]'
      ]);
      if (targeted) return targeted;
      const imageTitles = Array.from(row.querySelectorAll('img')).flatMap(image => [image.alt, image.title]);
      const imageTitle = firstValidTitle(imageTitles);
      if (imageTitle) return imageTitle;
      const lines = String(rawText || '').split(/[\r\n]+/).map(normalize).filter(Boolean);
      const lineTitle = firstValidTitle(lines);
      if (lineTitle) return lineTitle;
      const compact = normalize(rawText);
      const beforeMetric = compact.split(/(?:价格带|¥|￥|用户支付金额|成交金额|点击次数|查看详情|加入追踪)/)[0];
      return validTitle(beforeMetric) ? beforeMetric : '';
    };
    const findSecondaryText = (row, selectors) => {
      for (const selector of selectors) {
        const element = row.querySelector(selector);
        const value = normalize(element && (element.getAttribute('title') || element.innerText || element.textContent));
        if (value && value.length <= 100 && !ignoredExact.has(value)) return value;
      }
      return '';
    };
    const candidateSelector = [
      'tbody tr',
      '[role="row"][aria-rowindex]',
      '[data-row-key]',
      '[data-testid*="product-item"]',
      '[data-testid*="goods-item"]',
      '[class*="product-card"]',
      '[class*="productCard"]',
      '[class*="goods-card"]',
      '[class*="goodsCard"]',
      '[class*="commodity-card"]'
    ].join(',');
    const candidates = Array.from(document.querySelectorAll(candidateSelector));
    const pagePath = String(location.pathname || '').toLowerCase();
    const productDetailPage = /rank-product\/detail|compete[_-]product[_-]detail/.test(pagePath);
    const seenNodes = new Set();
    const seenItems = new Set();
    const items = [];
    for (const row of candidates) {
      if (items.length >= maxItems || seenNodes.has(row) || !visible(row)) continue;
      seenNodes.add(row);
      if (row.querySelector('th,[role="columnheader"]')) continue;
      const rawText = String(row.innerText || row.textContent || '');
      const text = normalize(rawText);
      if (text.length < 8 || text.length > 1000 || ignoredPattern.test(text)) continue;
      const href = findLink(row);
      const productId = findProductId(row, href, text);
      const videoId = findVideoId(row, href, text);
      const imageElement = Array.from(row.querySelectorAll('img')).find(image => visible(image) && Number(image.naturalWidth || image.width || 0) >= 24);
      const image = imageElement && imageElement.src ? String(imageElement.src) : '';
      const title = findTitle(row, rawText);
      const productLink = /product|goods|commodity|promotion|item/i.test(href || '');
      const videoLink = /(?:\/video\/|\/aweme\/|\/photo\/|short-video)/i.test(href || '');
      const videoRowEvidence = Boolean(videoId || videoLink || row.querySelector('[data-video-id],[data-aweme-id],video')) ||
        /(?:播放量|视频时长|关联视频|视频达人)/.test(text);
      const kind = videoRowEvidence || (productDetailPage && !productId && !productLink)
        ? 'video'
        : 'product';
      const rawId = kind === 'video' ? (videoId || productId) : (productId || videoId);
      const price = kind === 'product' ? findPrice(text) : '';
      const actionEvidence = /查看详情|加入追踪|佣金|成交|销量|价格带/.test(text);
      const previewEvidence = kind === 'video' && productDetailPage && image;
      if (!title || !(rawId || productLink || videoLink || previewEvidence || (image && price) || (price && actionEvidence))) continue;
      const key = rawId || href || (kind + '|' + title + '|' + image);
      if (seenItems.has(key)) continue;
      seenItems.add(key);
      const author = findSecondaryText(row, [
        '[class*="shopName"]', '[class*="shop-name"]', '[class*="authorName"]', '[class*="author-name"]',
        '[class*="nickName"]', '[class*="nickname"]', '[data-testid*="shop"]', '[data-testid*="author"]'
      ]);
      const commissionMatch = text.match(/(?:佣金率?|佣金比例)\s*[:：]?\s*([\d.]+\s*%)/);
      items.push({
        id: (rawId ? 'dom:' : 'preview:') + location.hostname + ':' + (rawId || fnv(key)),
        rawId,
        kind,
        title,
        product: kind === 'product' ? title : '',
        author,
        href,
        image,
        mediaUrl: '',
        price,
        commission: commissionMatch ? commissionMatch[1].replace(/\s+/g, '') : '',
        quality: rawId ? 'platform-id' : (href ? 'linked' : 'preview')
      });
    }
    const activePage = normalize((document.querySelector('[aria-current="page"],.ant-pagination-item-active,.semi-page-item-active,[class*="pagination"] [class*="active"]') || {}).innerText);
    const signatureBase = items.slice(0, 3).map(item => item.id + '|' + item.title).join('||') || normalize(document.body && document.body.innerText).slice(0, 300);
    return JSON.stringify({
      title: String(document.title || ''),
      url: String(location.href || ''),
      productCount: items.filter(item => item.kind === 'product').length,
      creatorCount: new Set(items.map(item => item.author).filter(Boolean)).size,
      videoCount: items.filter(item => item.kind === 'video').length,
      pageSignature: activePage + '|' + fnv(signatureBase),
      items
    });
  } catch (error) {
    return JSON.stringify({ error: String(error && error.message || error) });
  }
})()
