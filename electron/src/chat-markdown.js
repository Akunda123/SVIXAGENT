/* Offline Markdown only. No raw HTML, scripts, remote images or renderer Node access. */
;(function (root) {
  'use strict'
  const md = root.markdownit({ html: false, linkify: true, breaks: true, maxNesting: 40 })
  const originalValidate = md.validateLink.bind(md)
  md.validateLink = (url) => /^(https?:\/\/|mailto:)/i.test(url) && originalValidate(url)
  md.renderer.rules.image = (tokens, index) => '<span class="md-image-alt">' + md.utils.escapeHtml(tokens[index].content || '') + '</span>'
  md.renderer.rules.table_open = () => '<div class="md-table"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'
  const openLink = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet('rel', 'noopener noreferrer')
    return openLink(tokens, index, options, env, self)
  }
  function render(element, text) {
    // Only output from the closed, html:false parser enters this template. Library
    // escaping and URL validation are regression-tested with hostile model text.
    const template = document.createElement('template')
    template.innerHTML = md.render(String(text || ''))
    element.replaceChildren(template.content)
    for (const li of element.querySelectorAll('li')) {
      const first = li.firstElementChild?.tagName === 'P' ? li.firstElementChild : li
      const node = first.firstChild
      const match = node?.nodeType === 3 && /^\[([ xX])\]\s+/.exec(node.textContent)
      if (!match) continue
      node.textContent = node.textContent.slice(match[0].length)
      const input = document.createElement('input')
      input.type = 'checkbox'; input.checked = match[1].toLowerCase() === 'x'; input.disabled = true
      input.setAttribute('aria-label', li.textContent)
      first.insertBefore(input, node)
    }
  }
  root.AKDMarkdown = { render }
})(globalThis)
