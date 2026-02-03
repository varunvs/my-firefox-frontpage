/* global DOMPurify */

const SafeHTML = {
  config: {
    ALLOWED_TAGS: [
      'a', 'abbr', 'article', 'aside', 'b', 'blockquote', 'br', 'button',
      'caption', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
      'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'footer',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'i', 'img',
      'input', 'ins', 'kbd', 'label', 'li', 'main', 'mark', 'nav', 'ol',
      'option', 'p', 'pre', 'q', 's', 'samp', 'section', 'select', 'small',
      'span', 'strong', 'sub', 'summary', 'sup',
      'svg', 'circle', 'path', 'line', 'polyline', 'polygon', 'rect', 'g',
      'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u',
      'ul', 'var', 'wbr'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id',
      'style', 'data-*', 'type', 'value', 'name', 'placeholder', 'disabled',
      'checked', 'selected', 'role', 'aria-*', 'tabindex', 'draggable',
      'width', 'height', 'viewBox', 'fill', 'cx', 'cy', 'r', 'd',
      'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
      'points', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'rx', 'ry'
    ],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: true
  },

  sanitize(html) {
    return DOMPurify.sanitize(html, this.config);
  },

  setHTML(element, html) {
    element.innerHTML = DOMPurify.sanitize(html, this.config);
  },

  insertHTML(element, position, html) {
    element.insertAdjacentHTML(position, DOMPurify.sanitize(html, this.config));
  }
};
