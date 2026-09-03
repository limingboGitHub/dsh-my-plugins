/**
 * Edge-logic verification for the browser half: loads the actual bundle
 * through a simulated `window.__ModuleLoader__`, drives the injected session
 * store through the documented scenarios, and asserts notification behavior.
 *
 * Run: node tests/edge-logic.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

/** Records every constructed Notification (title, body). */
const sent = []
class FakeNotification {
  static permission = 'granted'
  static requestPermission() { return Promise.resolve('granted') }
  constructor(title, opts) { sent.push({ title, body: opts?.body }) }
}

/** Minimal SnapshotStore matching the sessions.list contract. */
function snapshotStore(initial) {
  let snapshot = initial
  const listeners = new Set()
  return {
    getSnapshot() { return snapshot },
    set(next) { snapshot = next; for (const fn of [...listeners]) fn() },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
  }
}

/** Drive the scenarios. */
function run(options) {
  sent.length = 0
  const document = options.document
  let registered
  globalThis.window = {
    __ModuleLoader__: { load(reg) { registered = reg } },
    Notification: FakeNotification,
  }
  globalThis.document = document

  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  // Mirror the combo service: the file executes as a plain script.
  new Function('window', source)(globalThis.window)
  assert.ok(registered, 'bundle must register via __ModuleLoader__.load')
  const { name, inject, apply } = registered.factory((spec) => {
    throw new Error('bundle must not require anything, got ' + spec)
  })
  assert.equal(name, 'session-completion-notify')
  assert.deepEqual(inject, ['sessions', 'locale'])

  const sessions = snapshotStore({
    ids: [],
    byId: {},
    current: undefined,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
  let registeredNs
  const locale = {
    register(ns, dicts) { registeredNs = { ns, dicts }; return () => {} },
    getSnapshot() { return { active: 'en' } },
  }
  const ctx = {
    sessions: { list: sessions },
    locale,
    effect(fn) { return fn() },
  }
  apply(ctx)
  assert.equal(registeredNs.ns, 'sessionNotify')
  assert.ok(registeredNs.dicts.en['notification.body'])
  return sessions
}

const visibleFocused = {
  visibilityState: 'visible',
  hasFocus: () => true,
}
const hidden = {
  visibilityState: 'hidden',
  hasFocus: () => true,
}

/** One listed session summary. */
function summary(id, running, completed, current) {
  return {
    id,
    title: undefined,
    displayTitle: 'Session ' + id,
    running,
    ...(completed ? { completed: true } : {}),
    blank: false,
    updatedAt: 1,
  }
}

// Scenario: first observation is silent for an already-idle session.
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a'], byId: { a: summary('a', false, false) }, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.deepEqual(sent, [], 'already-idle session must stay silent at load')
}

// Scenario: an unselected session finishing (running false + completed true) notifies.
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', true, false), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent.length, 1, 'unselected completion must notify once')
  assert.equal(sent[0].body, 'Session completed: Session a')
}

// Scenario: the selected session finishing while the page is visible and focused stays silent.
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a'], byId: { a: summary('a', true, false) }, current: 'a', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a'], byId: { a: summary('a', false, false) }, current: 'a', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.deepEqual(sent, [], 'watched selected session must stay silent')
}

// Scenario: the selected session finishing while the tab is hidden notifies (watching edge).
{
  const s = run({ document: hidden })
  s.set({ ids: ['a'], byId: { a: summary('a', true, false) }, current: 'a', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a'], byId: { a: summary('a', false, false) }, current: 'a', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent.length, 1, 'hidden-tab completion of the selected session must notify')
}

// Scenario: re-running clears completion, the next completion notifies again.
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', true, false), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent.length, 1)
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', true, false), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent.length, 1, 're-running must not notify')
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent.length, 2, 'the second unwatched completion must notify again')
}

// Scenario: a session already completed before load never notifies (first observation only records).
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.deepEqual(sent, [], 'completed-at-load session must stay silent')
}

// Scenario: denied permission keeps the watcher silent.
{
  FakeNotification.permission = 'denied'
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', true, false), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.deepEqual(sent, [], 'denied permission must stay silent')
  FakeNotification.permission = 'granted'
}

// Scenario: durable title is preferred over the display title.
{
  const s = run({ document: visibleFocused })
  s.set({ ids: ['a', 'b'], byId: { a: { ...summary('a', true, false), title: 'My Topic' }, b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  s.set({ ids: ['a', 'b'], byId: { a: { ...summary('a', false, true), title: 'My Topic' }, b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent[0].body, 'Session completed: My Topic')
}

// Scenario: zh locale uses the Chinese dictionary.
{
  let active = 'en'
  const s = snapshotStore({
    ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
  })
  let applyFn
  globalThis.window = {
    __ModuleLoader__: { load(reg) { applyFn = reg.factory((spec) => { throw new Error('unexpected require ' + spec) }).apply } },
    Notification: FakeNotification,
  }
  globalThis.document = visibleFocused
  // Re-execute to grab apply with a fresh closure, then drive with a locale
  // snapshot that flips to zh.
  const source = readFileSync(join(ROOT, 'client.js'), 'utf8')
  new Function('window', source)(globalThis.window)
  const locale = {
    register() { return () => {} },
    getSnapshot() { return { active } },
  }
  applyFn({ sessions: { list: s }, locale, effect: (fn) => fn() })
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', true, false), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  active = 'zh'
  sent.length = 0
  s.set({ ids: ['a', 'b'], byId: { a: summary('a', false, true), b: summary('b', false, false) }, current: 'b', phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  assert.equal(sent[0].body, '会话已完成：Session a')
}

console.log('edge-logic: all scenarios passed')