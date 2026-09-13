// Toasts announce politely. reka-ui's ToastRoot defaults to type "foreground",
// which reads every toast (undo countdowns, "Saved", "Moved to trash") through
// an assertive live region that interrupts the screen reader. Every toast
// without an explicit type becomes "background" (aria-live="polite"); error
// toasts stay assertive. Nuxt UI keeps its queue in useState('toasts').
export default defineNuxtPlugin(() => {
  const toasts = useState<Array<{ type?: 'foreground' | 'background', color?: string }>>('toasts', () => [])
  watch(toasts, (list) => {
    for (const t of list) {
      if (!t.type) t.type = t.color === 'error' ? 'foreground' : 'background'
    }
  }, { deep: true, flush: 'sync', immediate: true })
})
