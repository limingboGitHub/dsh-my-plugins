/**
 * @lmber/dsh-session-completion-notify — browser half, single self-contained
 * bundle.
 *
 * The DSH web client module system hands each `dsh.client` package's
 * `exports["./client"]` file byte-for-byte to the page and expects a
 * `window.__ModuleLoader__.load({ id, factory })` registration whose factory is
 * a synchronous CJS closure. It does not bundle, transform, or resolve
 * relative imports, so this file carries everything it needs — including the
 * locale dictionaries — and imports nothing.
 *
 * Behavior (unchanged intent, current DSH plumbing):
 *
 * 1. Official completion bit. `ctx.sessions.list` summaries carry a
 *    `completed` flag maintained by the session controller: a session that
 *    finishes while not selected arms it (the sidebar's green done dot),
 *    selecting or re-running it clears it. A false→true edge here notifies.
 *    Because the host computes the flag from the same running edges as the
 *    selected-session check, the plugin no longer re-derives "not selected".
 * 2. Watching edge. The official flag only keys off selection, so the one
 *    case it cannot see — the user watching the selected session while the
 *    tab is hidden or the window unfocused — is covered by the plugin's own
 *    `running` true→false edge plus page-visibility check, exactly like the
 *    previous version.
 *
 * The two signals share one per-session observation cycle, so one completion
 * emits at most one notification.
 */

'use strict'

window.__ModuleLoader__.load({
  id: '@lmber/dsh-session-completion-notify',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    /** Plugin name shown in Cordis inspection surfaces. */
    var name = 'session-completion-notify'

    /** Required services: the session-list snapshot store and the locale registry. */
    var inject = ['sessions', 'locale']

    // ---- dictionary (self-contained; key set owned by `zh`) ----
    var NS = 'sessionNotify'

    var zh = {
      'notification.title': 'DeepSeek Harness',
      'notification.body': '会话已完成：{title}',
    }

    var en = {
      'notification.title': 'DeepSeek Harness',
      'notification.body': 'Session completed: {title}',
    }

    // ---- helpers (defensive: browser-only surface) ----
    function notificationApi() {
      if (typeof window === 'undefined') return undefined
      return typeof window.Notification === 'function' ? window.Notification : undefined
    }

    function interpolate(template, args) {
      return template.replace(/\{(\w+)\}/g, function (_, key) {
        return String(args[key] ?? '')
      })
    }

    /**
     * Whether the DSH page is actually in front of the user. A selected
     * session is "watched" only while its tab is visible AND the window holds
     * focus; switching to another tab or another application makes even the
     * selected session unwatched, so its completion must notify.
     */
    function pageIsVisibleAndFocused() {
      if (typeof document === 'undefined') return true
      if (document.visibilityState === 'hidden') return false
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false
      return true
    }

    /** The active locale: locale service snapshot, then browser language. */
    function activeLocale(ctx) {
      try {
        var snap = ctx.locale && typeof ctx.locale.getSnapshot === 'function'
          ? ctx.locale.getSnapshot() : undefined
        var value = snap && snap.active
        if (value === 'zh' || value === 'en') return value
      } catch (error) {
        // fall through to the browser language
      }
      try {
        var lang = (typeof navigator !== 'undefined' && navigator.language) || ''
        return lang.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      } catch (error) {
        return 'en'
      }
    }

    /**
     * Ask for notification permission once at boot while the browser still
     * shows the prompt. Engines may only allow the request from a user
     * gesture; a rejected request just leaves the permission un-granted and
     * the watcher stays silent. The watcher reads permission live, so a later
     * grant through browser site settings takes effect without a reload.
     */
    function requestPermission() {
      var api = notificationApi()
      if (api === undefined || api.permission !== 'default') return
      if (typeof api.requestPermission !== 'function') return
      api.requestPermission().catch(function () {
        // Prompt not shown (non-gesture context) or dismissed; nothing to undo.
      })
    }

    /** Client plugin body: register the dictionaries and watch the session list. */
    function apply(ctx) {
      ctx.effect(function () {
        return ctx.locale.register(NS, { zh: zh, en: en })
      }, 'session-completion-notify: dictionaries')

      requestPermission()

      ctx.effect(function () {
        var list = ctx.sessions.list

        /**
         * Last-observed per-session state. `running` and `completed` edges are
         * detected separately: the official completion bit covers finishes
         * while the session is not selected, and the plugin's own running edge
         * plus focus check covers the selected-but-not-in-front case.
         */
        var prev = new Map()

        function notify(locale, title) {
          var api = notificationApi()
          if (api === undefined || api.permission !== 'granted') return
          var dict = locale === 'zh' ? zh : en
          new api(dict['notification.title'], {
            body: interpolate(dict['notification.body'], { title: title }),
          })
        }

        function onSnapshot(snapshot) {
          try {
            var seen = new Set()
            var locale = activeLocale(ctx)
            for (var id in snapshot.byId) {
              var summary = snapshot.byId[id]
              seen.add(id)
              var previous = prev.get(id)
              if (previous === undefined) {
                // First observation only records state — sessions already
                // idle or already completed at load stay silent, mirroring the
                // host's own first-observation rule.
                prev.set(id, { running: summary.running, completed: !!summary.completed })
                continue
              }
              var completedNow = !!summary.completed
              var completedEdge = !previous.completed && completedNow
              var runningEdge = previous.running && !summary.running
              var unwatched = summary.id !== snapshot.current || !pageIsVisibleAndFocused()
              if (completedEdge || (runningEdge && unwatched)) {
                var title = summary.title ?? summary.displayTitle
                notify(locale, title)
              }
              prev.set(id, { running: summary.running, completed: completedNow })
            }
            for (var key of prev.keys()) {
              if (!seen.has(key)) prev.delete(key)
            }
          } catch (error) {
            // Swallow watcher errors to keep the UI alive.
          }
        }

        var unsubscribe = list.subscribe(function () {
          onSnapshot(list.getSnapshot())
        })
        onSnapshot(list.getSnapshot())
        return unsubscribe
      }, 'session-completion-notify: completion edge watcher')
    }

    module.exports = { name: name, inject: inject, apply: apply }
    return module.exports
  },
})