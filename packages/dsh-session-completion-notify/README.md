# @lmber/dsh-session-completion-notify

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web client plugin that emits one OS-level system notification when a session finishes running **while you are not watching it** — the session is not selected, the tab is hidden, or the browser window has lost focus.

Requires DSH 0.1.2-alpha.5 or newer (the `sessions` client service from `@deepseek-ai/dsh-api-session-controller` and the `locale` service from `@deepseek-ai/dsh-client-locale`).

## How it works

The plugin consumes the session-list snapshot store (`ctx.sessions.list`) and notifies on two edges, sharing one per-session observation cycle so a single completion emits at most one notification:

- **Official completion bit.** Each session summary carries a `completed` flag maintained by the session controller: a session that finishes while not selected arms it — the same fact as the sidebar's green "done" dot — and selecting or re-running it clears it. A false→true edge here notifies.
- **Watching edge.** The official flag only keys off selection, so the one case it cannot see — the user looking at the **selected** session while the tab is hidden or the window is unfocused — is covered by the plugin's own `running` true→false edge plus page-visibility and focus checks, exactly like older versions.

A session you are actually watching (selected, with the page in front) never notifies; the moment you switch to another tab or another application, even that selected session's completion will notify you. The notification body names the session's durable title when the host has projected one, otherwise its display title.

Notification permission is requested once at boot while the browser still shows the prompt. The permission is read live, so a later grant through browser settings takes effect without a reload; a denied permission keeps the watcher silent.

## Install

```sh
dsh plugin --profile web add @lmber/dsh-session-completion-notify
```

Then insert a `dsh.client` row into `$DSH_HOME/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: session-completion-notify
      name: '@lmber/dsh-session-completion-notify'
```

Restart DSH. To uninstall, remove the row and run `dsh plugin --profile web remove @lmber/dsh-session-completion-notify`.

### Install from GitHub

```sh
dsh plugin --profile web add github:limingboGitHub/dsh-my-plugins
```

The repository is a collection; the plugin path is `packages/dsh-session-completion-notify`.

## Behavior

- The plugin subscribes to `ctx.sessions.list` and tracks, per session, the last-observed `running` bit and the official `completed` bit.
- First observation only records state, so sessions already idle (or already completed) at load stay silent.
- Notifications fire only when the user is not watching the session: the official completion bit covers finishes while the session is not selected; the plugin's own running edge plus focus check covers the selected-but-page-not-in-front case.
- Re-running the same session clears its completion state, so each unwatched completion notifies again.

## Developer notes

- The browser half is a single self-contained file (`client.js`) registered through `window.__ModuleLoader__.load`. The DSH client module service serves `exports["./client"]` byte-for-byte and resolves no relative imports, so the file carries its locale dictionaries inline and requires nothing at runtime; the two Cordis services (`sessions`, `locale`) arrive through declared injection.
- The user-facing copy is owned by the dictionaries in `client.js` under the `sessionNotify` namespace.

## Known Limitations

- Permission prompting is gesture-reliant on some engines (WebKit, older Chromium), so a boot-time request can be silently dropped; use browser site settings to allow notifications if needed.
- Notifications are edge-based, not count-based: a session that completes and immediately re-runs within one snapshot interval may be missed.

## License

MIT