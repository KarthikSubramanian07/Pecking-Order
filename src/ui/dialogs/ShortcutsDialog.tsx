import { isMac } from '../chrome/keys'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mod = isMac() ? '⌘' : 'Ctrl'
  const rows: [string, string[]][] = [
    ['Pick up / drop the focused item', ['Space']],
    ['Move a picked-up item', ['←', '↑', '→', '↓']],
    ['Cancel a move', ['Esc']],
    ['Send focused item to tier 1–9', ['1', '…', '9']],
    ['Send focused item to the Coop', ['0']],
    ['Edit the focused item', ['E']],
    ['Remove the focused item', ['Delete']],
    ['Select for tap-to-place', ['Click']],
    ['Undo', [mod, 'Z']],
    ['Redo', [mod, '⇧', 'Z']],
    ['Paste images, links or a list', [mod, 'V']],
    ['Show this list', ['?']],
  ]
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      subtitle="Everything works without a mouse."
      size="sm"
    >
      <dl className={styles.keys}>
        {rows.map(([label, keys]) => (
          <div key={label} className={styles.keyRow}>
            <dt>{label}</dt>
            <dd>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  )
}
