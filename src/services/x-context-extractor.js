/**
 * X (Twitter) post context extraction for reply suggestions.
 * DOM selectors may need updates when X changes their markup.
 */

const X_HOSTS = ['x.com', 'twitter.com'];

export function isXHost(hostname = '') {
  const host = hostname.toLowerCase();
  return X_HOSTS.some(domain => host === domain || host.endsWith(`.${domain}`));
}

export function isXComposeInput(element, hostname = window?.location?.hostname || '') {
  if (!element || !isXHost(hostname)) return false;

  const testId = element.getAttribute('data-testid') || '';
  if (testId.includes('tweetTextarea')) return true;

  return Boolean(
    element.closest('[data-testid*="tweetTextarea"]') ||
    element.closest('[role="textbox"][contenteditable="true"]')?.closest('[data-testid*="tweetTextarea"]')
  );
}

/** @deprecated use isXComposeInput */
export function isXReplyInput(element, hostname) {
  return isXComposeInput(element, hostname);
}

function getTextContent(el) {
  if (!el) return '';
  return (el.textContent || el.innerText || '').trim();
}

function getTweetText(article) {
  if (!article) return '';
  const textEl =
    article.querySelector('[data-testid="tweetText"]') ||
    article.querySelector('[lang]');
  return getTextContent(textEl);
}

function getTweetAuthor(article) {
  if (!article) return '';
  const userBlock =
    article.querySelector('[data-testid="User-Name"]') ||
    article.querySelector('[data-testid="UserName"]');
  if (!userBlock) return '';
  const lines = getTextContent(userBlock).split('\n').map(s => s.trim()).filter(Boolean);
  return lines[0] || '';
}

function getTweetHandle(article) {
  if (!article) return '';
  const userBlock =
    article.querySelector('[data-testid="User-Name"]') ||
    article.querySelector('[data-testid="UserName"]');
  if (!userBlock) return '';
  const lines = getTextContent(userBlock).split('\n').map(s => s.trim()).filter(Boolean);
  return lines.find(line => line.startsWith('@')) || '';
}

function buildContext(targetArticle, doc, parentArticle = null) {
  const text = getTweetText(targetArticle);
  if (!text) return null;

  const parentText = parentArticle ? getTweetText(parentArticle) : '';

  return {
    author: getTweetAuthor(targetArticle),
    handle: getTweetHandle(targetArticle),
    text: text.slice(0, 500),
    parentText: parentText ? parentText.slice(0, 300) : '',
    url: doc.location?.href || ''
  };
}

function articleContainsComposer(article, replyInput) {
  return article.contains(replyInput) ||
    article.querySelector('[data-testid*="tweetTextarea"]');
}

function findTargetArticle(replyInput, doc) {
  const composeAnchor =
    replyInput.closest('[data-testid="tweetTextarea_0_label"]') ||
    replyInput.closest('[data-testid*="tweetTextarea"]');

  if (composeAnchor) {
    const scopedRoot = composeAnchor.parentElement;
    if (scopedRoot) {
      const marker = composeAnchor.closest('[data-testid="tweetTextarea_0_label"]') || composeAnchor;
      const children = Array.from(scopedRoot.children);
      const markerIndex = children.indexOf(marker);

      for (let i = markerIndex - 1; i >= 0; i--) {
        const child = children[i];
        const article = child.matches?.('article') ? child : child.querySelector?.('article');
        if (article && !articleContainsComposer(article, replyInput) && getTweetText(article)) {
          return article;
        }
      }
    }

    let sibling = composeAnchor.previousElementSibling;
    while (sibling) {
      const article = sibling.matches?.('article') ? sibling : sibling.querySelector?.('article');
      if (article && !articleContainsComposer(article, replyInput) && getTweetText(article)) {
        return article;
      }
      sibling = sibling.previousElementSibling;
    }
  }

  const dialog = replyInput.closest('[role="dialog"]');
  if (dialog) {
    const articles = dialog.querySelectorAll('article');
    for (let i = articles.length - 1; i >= 0; i--) {
      const article = articles[i];
      if (!articleContainsComposer(article, replyInput) && getTweetText(article)) {
        return article;
      }
    }
  }

  const inlineArticle = replyInput.closest('article');
  if (inlineArticle) {
    let sibling = inlineArticle.previousElementSibling;
    while (sibling) {
      const article = sibling.matches?.('article') ? sibling : sibling.querySelector?.('article');
      if (article && getTweetText(article)) return article;
      sibling = sibling.previousElementSibling;
    }
  }

  return null;
}

function findParentArticle(targetArticle, doc) {
  if (!targetArticle) return null;

  const threadArticles = (doc.querySelector('[data-testid="primaryColumn"]') || doc.body)
    .querySelectorAll('article');
  const list = Array.from(threadArticles).filter(a => getTweetText(a));
  const idx = list.indexOf(targetArticle);
  if (idx > 0) return list[idx - 1];

  return null;
}

function extractFromStatusUrl(doc) {
  const match = doc.location?.href?.match(/\/status\/(\d+)/);
  if (!match) return null;

  const statusId = match[1];
  const root = doc.querySelector('[data-testid="primaryColumn"]') || doc.body;
  const articles = root.querySelectorAll('article');

  for (const article of articles) {
    const statusLink = article.querySelector(`a[href*="/status/${statusId}"]`);
    if (statusLink && getTweetText(article)) {
      return buildContext(article, doc, findParentArticle(article, doc));
    }
  }

  for (const article of articles) {
    if (getTweetText(article)) {
      return buildContext(article, doc, findParentArticle(article, doc));
    }
  }

  return null;
}

function extractNearestVisibleTweet(replyInput, doc) {
  const root = doc.querySelector('[data-testid="primaryColumn"]') || doc.body;
  const articles = root.querySelectorAll('article');

  for (const article of articles) {
    if (replyInput && article.contains(replyInput)) continue;
    if (articleContainsComposer(article, replyInput)) continue;
    const ctx = buildContext(article, doc);
    if (ctx) return ctx;
  }

  return null;
}

/**
 * Extract the post the user is replying to.
 * @param {Element|null} replyInput - focused reply textarea / contenteditable
 * @param {Document} doc
 * @returns {{ author: string, handle: string, text: string, parentText: string, url: string } | null}
 */
export function extractTweetContext(replyInput, doc = document) {
  if (!doc) return null;

  if (replyInput) {
    const targetArticle = findTargetArticle(replyInput, doc);
    const scoped = buildContext(targetArticle, doc, findParentArticle(targetArticle, doc));
    if (scoped) return scoped;
  }

  const fromUrl = extractFromStatusUrl(doc);
  if (fromUrl) return fromUrl;

  return extractNearestVisibleTweet(replyInput, doc);
}
