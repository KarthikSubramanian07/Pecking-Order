import { useEffect, useState } from 'react'
import { opUpdateItem } from '@/core/board'
import { boardActions, useBoardStore } from '@/state/boardStore'
import { useUiStore } from '@/state/uiStore'
import { Trash } from '@/ui/icons'
import { removeItems } from '../actions'
import { ItemTile } from '../board/ItemTile'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

export function ItemDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const id = useUiStore((s) => s.editingItem)
  const item = useBoardStore((s) => (id ? s.board?.items[id] : undefined))
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (open && item) setLabel(item.label)
  }, [open, item])

  if (!item || !id)
    return (
      <Dialog open={false} onClose={onClose} title="">
        {null}
      </Dialog>
    )

  const save = () => {
    if (label !== item.label) boardActions().apply((b) => opUpdateItem(b, id, { label }))
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit item"
      size="sm"
      footer={
        <>
          <button
            type="button"
            className={btn.button}
            data-variant="danger"
            onClick={() => {
              onClose()
              removeItems([id])
            }}
          >
            <Trash size={16} aria-hidden /> Remove
          </button>
          <span style={{ flex: 1 }} />
          <button type="button" className={btn.button} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="item-form" className={btn.button} data-variant="primary">
            Save
          </button>
        </>
      }
    >
      <form
        id="item-form"
        className={styles.itemForm}
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className={styles.itemPreview} style={{ '--item': '120px' } as React.CSSProperties}>
          <ItemTile item={{ ...item, label }} showLabel={false} />
        </div>
        <label className={styles.field}>
          <span className="label">Label</span>
          <input
            className={styles.input}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
            // biome-ignore lint/a11y/noAutofocus: the dialog exists to edit this field
            autoFocus
          />
        </label>
        {item.credit && item.credit.provider !== 'upload' && item.credit.provider !== 'paste' && (
          <p className={styles.credit}>
            Image: {item.credit.author ? `${item.credit.author} · ` : ''}
            {item.credit.license ?? item.credit.provider}
            {item.credit.sourceUrl && (
              <>
                {' · '}
                <a href={item.credit.sourceUrl} target="_blank" rel="noopener noreferrer">
                  source
                </a>
              </>
            )}
          </p>
        )}
      </form>
    </Dialog>
  )
}
