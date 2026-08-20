# @lmber/dsh-session-completion-notify

English | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web client plugin that emits one OS-level system notification when a session finishes running **while you are not watching it** — the session is not selected, the tab is hidden, or the browser window has lost focus.

The trigger is the same running→idle edge of a session's `running` bit that arms the sidebar's green completion dot, so the two surfaces agree on what "finished" means. A session you are actually watching (selected and with the page in front) never notifies; the moment you switch to another tab or another application, even that selected session's completion will notify you. The notification body names the session's durable title when the host has projected one, otherwise its display title.

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

- The plugin subscribes to `ctx.sessions.list` and keeps a last-observed running bit per session.
- First observation only records the bit, so sessions already idle at load stay silent.
- A true→false edge arms exactly one Notification whenever the user is not watching that session: it is not selected, the tab is hidden, or the browser window is unfocused. A selected session stays silent only while the page is visible and focused.
- Re-running the same session starts a fresh observation cycle, so each unwatched completion notifies again.

## Known Limitations

- Permission prompting is gesture-reliant on some engines (WebKit, older Chromium), so a boot-time request can be silently dropped; use browser site settings to allow notifications if needed.
- Notifications are edge-based, not count-based: a session that completes and immediately re-runs within one snapshot interval may be missed.

## License

MIT
