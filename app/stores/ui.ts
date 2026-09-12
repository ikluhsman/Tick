// UI store — cross-component dialog state.
// PickerModal (time agent) reads pickerOpen/pickerTarget/pickerTab and writes pickerResult
// for the manual-entry dialog; the timer bar and pages only flip this state.

export const useUiStore = defineStore('ui', () => {
  const pickerOpen = ref(false)
  const pickerTarget = ref<'timer' | 'manual'>('timer')
  /** Which tab the picker opens on (set by the timer bar's + menu). */
  const pickerTab = ref<RefType>('task')
  /** Set by PickerModal when target is 'manual'; ManualEntryDialog consumes + clears it. */
  const pickerResult = ref<ChainRef | null>(null)

  const manualOpen = ref(false)

  const cascade = ref<{ open: boolean, kind: 'client' | 'project', id: string | null }>({
    open: false,
    kind: 'client',
    id: null
  })

  function openPicker(target: 'timer' | 'manual', tab: RefType = 'task') {
    pickerTarget.value = target
    pickerTab.value = tab
    pickerOpen.value = true
  }

  function closePicker() {
    pickerOpen.value = false
  }

  function openManual() {
    manualOpen.value = true
  }

  function closeManual() {
    manualOpen.value = false
  }

  function openCascade(kind: 'client' | 'project', id: string) {
    cascade.value = { open: true, kind, id }
  }

  function closeCascade() {
    cascade.value = { ...cascade.value, open: false, id: null }
  }

  return {
    pickerOpen,
    pickerTarget,
    pickerTab,
    pickerResult,
    manualOpen,
    cascade,
    openPicker,
    closePicker,
    openManual,
    closeManual,
    openCascade,
    closeCascade
  }
})
