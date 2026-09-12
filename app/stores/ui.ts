// UI store — cross-component dialog state.
// PickerModal (time agent) reads pickerOpen/pickerTarget/pickerTab and writes pickerResult
// for the manual-entry dialog; the timer bar and pages only flip this state.
// pickerTarget 'bulk' = SelectionBar's "Move to…" (picker reassigns the selection itself).

export type PickerTarget = 'timer' | 'manual' | 'bulk'

export const useUiStore = defineStore('ui', () => {
  const pickerOpen = ref(false)
  const pickerTarget = ref<PickerTarget>('timer')
  /** Which tab the picker opens on (set by the timer bar's + menu). */
  const pickerTab = ref<RefType>('task')
  /** Set by PickerModal when target is 'manual'; ManualEntryDialog consumes + clears it. */
  const pickerResult = ref<ChainRef | null>(null)

  const manualOpen = ref(false)
  /** When set, ManualEntryDialog opens prefilled in edit mode for this entry. */
  const editEntry = ref<EntryDto | null>(null)

  const cascade = ref<{ open: boolean, kind: 'client' | 'project', id: string | null }>({
    open: false,
    kind: 'client',
    id: null
  })

  function openPicker(target: PickerTarget, tab: RefType = 'task') {
    pickerTarget.value = target
    pickerTab.value = tab
    pickerOpen.value = true
  }

  function closePicker() {
    pickerOpen.value = false
  }

  function openManual() {
    editEntry.value = null
    manualOpen.value = true
  }

  function openEdit(entry: EntryDto) {
    editEntry.value = entry
    manualOpen.value = true
  }

  function closeManual() {
    manualOpen.value = false
    editEntry.value = null
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
    editEntry,
    cascade,
    openPicker,
    closePicker,
    openManual,
    openEdit,
    closeManual,
    openCascade,
    closeCascade
  }
})
