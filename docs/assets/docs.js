const root = document.documentElement
const search = document.querySelector('#docs-search')
const results = document.querySelector('#search-results')
const nav = document.querySelector('#site-nav')
const navToggle = document.querySelector('.nav-toggle')
const themeToggle = document.querySelector('.theme-toggle')
const sections = [...document.querySelectorAll('[data-search]')]
const navLinks = [...document.querySelectorAll('.sidebar nav a')]

const preferredTheme = localStorage.getItem('pagenova-docs-theme')
if (preferredTheme === 'light' || preferredTheme === 'dark') root.dataset.theme = preferredTheme

function setThemeButtonLabel() {
  const isLight = root.dataset.theme === 'light'
  themeToggle.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme')
}

setThemeButtonLabel()

themeToggle.addEventListener('click', () => {
  const next = root.dataset.theme === 'light' ? 'dark' : 'light'
  root.dataset.theme = next
  localStorage.setItem('pagenova-docs-theme', next)
  setThemeButtonLabel()
})

navToggle.addEventListener('click', () => {
  const isOpen = nav.classList.toggle('open')
  navToggle.setAttribute('aria-expanded', String(isOpen))
  navToggle.setAttribute('aria-label', isOpen ? 'Close documentation navigation' : 'Open documentation navigation')
})

navLinks.forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open')
  navToggle.setAttribute('aria-expanded', 'false')
  navToggle.setAttribute('aria-label', 'Open documentation navigation')
}))

function closeSearch() {
  results.hidden = true
  results.replaceChildren()
  search.setAttribute('aria-expanded', 'false')
}

function resultDescription(section) {
  const paragraph = section.querySelector('p')
  return paragraph?.textContent?.trim().replace(/\s+/g, ' ') || 'Open this documentation section.'
}

function showSearchResults() {
  const query = search.value.trim().toLowerCase()
  if (!query) return closeSearch()

  const matches = sections.filter((section) => `${section.dataset.search} ${section.textContent}`.toLowerCase().includes(query)).slice(0, 7)
  results.replaceChildren()
  results.hidden = false
  search.setAttribute('aria-expanded', 'true')

  if (!matches.length) {
    const empty = document.createElement('p')
    empty.className = 'search-empty'
    empty.textContent = 'No matching section. Try “Ollama”, “screenshot”, or “context”.'
    results.append(empty)
    return
  }

  matches.forEach((section) => {
    const button = document.createElement('button')
    const title = section.querySelector('h1, h2')?.textContent?.trim() || 'Documentation'
    button.className = 'search-result'
    button.type = 'button'
    button.setAttribute('role', 'option')
    button.innerHTML = `<strong>${title}</strong><small>${resultDescription(section)}</small>`
    button.addEventListener('click', () => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' })
      closeSearch()
      search.value = ''
    })
    results.append(button)
  })
}

search.addEventListener('input', showSearchResults)
search.addEventListener('focus', showSearchResults)
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== search && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault()
    search.focus()
  }
  if (event.key === 'Escape') {
    closeSearch()
    search.blur()
    if (nav.classList.contains('open')) navToggle.click()
  }
})
document.addEventListener('click', (event) => {
  if (!event.target.closest('.search-wrap')) closeSearch()
})

const activeLinkFor = (id) => navLinks.find((link) => link.getAttribute('href') === `#${id}`)
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
  if (!visible) return
  navLinks.forEach((link) => link.classList.remove('active'))
  activeLinkFor(visible.target.id)?.classList.add('active')
}, { rootMargin: '-20% 0px -65% 0px', threshold: [0.05, 0.25] })

sections.filter((section) => section.id).forEach((section) => observer.observe(section))
