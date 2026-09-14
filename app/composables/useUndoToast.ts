// Rule 4 undo toast: visible countdown, Undo restores.

export function useUndoToast() {
  const toast = useToast()
  const ui = useUiStore()

  function showUndoToast(message: string, onUndo: () => void | Promise<void>) {
    const id = `undo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const undoSeconds = ui.undoSeconds // Rule 4: 3–30s, Settings → Profile
    let left = undoSeconds
    const tick = setInterval(() => {
      left -= 1
      if (left <= 0) {
        clearInterval(tick)
        return
      }
      // Countdown is plain text only. duration must be re-passed unchanged:
      // update() hard-sets it from this patch, so omitting it would drop the
      // toast to the provider default mid-count and passing a shrinking value
      // pushes progress past 100 (ProgressRoot "Invalid prop" spam). A constant
      // value never re-triggers reka's [open, duration] watch, so the close
      // timer started by add() keeps running untouched.
      toast.update(id, { description: `Undo within ${left}s`, duration: undoSeconds * 1000 })
    }, 1000)

    toast.add({
      id,
      title: message,
      description: `Undo within ${left}s`,
      icon: 'i-lucide-trash-2',
      color: 'neutral',
      duration: undoSeconds * 1000,
      actions: [{
        label: 'Undo',
        color: 'primary',
        variant: 'outline',
        onClick: () => {
          clearInterval(tick)
          void onUndo()
        }
      }]
    })
  }

  return { showUndoToast }
}
