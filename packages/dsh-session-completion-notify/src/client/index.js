/**
 * Session-completion notification plugin, browser half.
 *
 * Watches the session-list snapshot store (`ctx.sessions.list`) and arms one
 * OS-level Notification when a session's `running` bit falls while the user is
 * not watching it — the session is not selected, the tab is hidden, or the
 * browser window is unfocused. A selected session with the page in front is
 * the one case the user is already watching, so it stays silent.
 */

import { en, NS, zh } from './locales.js'

/** Required services: the session-list feed and the locale registry. */
export const inject = ['sessions', 'locale']

/** Browser Notification constructor surface, absent outside a browser. */
function notificationApi() {
  if (typeof window === 'undefined') return undefined
  return typeof window.Notification === 'function' ? window.Notification : undefined
}

function interpolate(template, args) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(args[key] ?? ''))
}

/**
 * Whether the DSH page is actually visible to the user right now. A selected
 * session counts as "watched" only while its tab is visible AND the browser
 * window has focus; switching to another tab or another application makes even
 * the selected session unwatched, so its completion must notify.
 */
function pageIsVisibleAndFocused() {
  if (typeof document === 'undefined') return true
  if (document.visibilityState === 'hidden') return false
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
  return true
}

/** The user is watching a session exactly when it is selected and the page is in front. */
function isWatchingSession(snapshot, sessionId) {
  if (sessionId !== snapshot.current) return false
  return pageIsVisibleAndFocused()
}

function activeLocale(ctx) {
  try {
    const snap = ctx.locale && ctx.locale.getSnapshot ? ctx.locale.getSnapshot() : undefined
    const value = snap && (snap.active || snap.current)
    if (value === 'zh' || value === 'en') return value
  } catch (error) {
    // fall through to navigator
  }
  try {
    const lang = (typeof navigator !== 'undefined' && navigator.language) || ''
    return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } catch (error) {
    return 'en'
  }
}

/**
 * Ask for notification permission once at boot while the browser still shows
 * the prompt. Engines may only allow the request from a user gesture; a
 * rejected request just leaves the permission un-granted and the watcher stays
 * silent. The watcher reads permission live, so a later grant through browser
 * settings takes effect without a reload.
 */
function requestPermission() {
  const api = notificationApi()
  if (api === undefined || api.permission !== 'default') return
  if (typeof api.requestPermission !== 'function') return
  api.requestPermission().catch(() => {
    // Prompt not shown (non-gesture context) or dismissed; nothing to undo.
  })
}

/**
 * Client plugin body: register the dictionaries and watch the session list.
 * @param ctx - client root context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'session-completion-notify: dictionaries')

  requestPermission()

  ctx.effect(() => {
    const list = ctx.sessions.list
    /** Last-observed running bits per session; the true→false edge here arms one notification. */
    const prevRunning = new Map()

    const notify = (body) => {
      const api = notificationApi()
      if (api === undefined || api.permission !== 'granted') return
      const dict = activeLocale(ctx) === 'zh' ? zh : en
      new api(dict['notification.title'], { body })
    }

    const onSnapshot = (snapshot) => {
      try {
        const seen = new Set()
        for (const summary of Object.values(snapshot.byId)) {
          seen.add(summary.id)
          const prev = prevRunning.get(summary.id)
          if (prev === undefined) {
            // First observation only records the bit — sessions already idle at
            // load get no notification, mirroring the sidebar's reminder logic.
            prevRunning.set(summary.id, summary.running)
            continue
          }
          if (prev && !summary.running && !isWatchingSession(snapshot, summary.id)) {
            const title = summary.title ?? summary.displayTitle
            const dict = activeLocale(ctx) === 'zh' ? zh : en
            notify(interpolate(dict['notification.body'], { title }))
          }
          prevRunning.set(summary.id, summary.running)
        }
        for (const id of prevRunning.keys()) {
          if (!seen.has(id)) prevRunning.delete(id)
        }
      } catch (error) {
        // swallow watcher errors to keep the UI alive
      }
    }

    const unsubscribe = list.subscribe(() => onSnapshot(list.getSnapshot()))
    onSnapshot(list.getSnapshot())
    return unsubscribe
  }, 'session-completion-notify: completion edge watcher')
}
