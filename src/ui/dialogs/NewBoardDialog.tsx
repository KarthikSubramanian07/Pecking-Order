import { ArrowRight } from '@phosphor-icons/react'
import { useEffect, useId, useState } from 'react'
import { SWATCHES } from '@/core/palette'
import { DEFAULT_PRESET, TIER_PRESETS, tiersFromPreset } from '@/core/presets'
import { boardFromPack, listPacks } from '@/packs/install'
import type { PackSummary } from '@/packs/types'
import { useBoardStore } from '@/state/boardStore'
import { ui } from '@/state/uiStore'
import btn from '../primitives/Button.module.css'
import { Dialog } from '../primitives/Dialog'
import styles from './dialogs.module.css'

const accentHex = (name?: string) => SWATCHES.find((s) => s.name === name)?.hex ?? SWATCHES[0]?.hex

export function NewBoardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [presetId, setPresetId] = useState(DEFAULT_PRESET.id)
  const [packs, setPacks] = useState<PackSummary[]>([])
  const name = useId()

  useEffect(() => {
    if (open) void listPacks().then(setPacks)
  }, [open])

  const create = async () => {
    const preset = TIER_PRESETS.find((p) => p.id === presetId) ?? DEFAULT_PRESET
    await useBoardStore
      .getState()
      .newBoard({ title: title.trim() || 'Untitled pecking order', preset })
    setTitle('')
    onClose()
  }

  const fromPack = async (pack: PackSummary) => {
    onClose()
    const label = `Hatching ${pack.title}`
    ui().setBusy({ label, done: 0, total: pack.itemCount })
    try {
      const board = await boardFromPack(pack.id, {
        onProgress: ({ done, total }) => ui().setBusy({ label, done, total }),
      })
      await useBoardStore.getState().openBoard(board)
      ui().toast({ message: `${pack.title} is ready. Start pecking.` })
    } catch (err) {
      ui().toast({
        message: err instanceof Error ? err.message : 'That pack failed to load.',
        tone: 'error',
      })
    } finally {
      ui().setBusy(null)
    }
  }

  const categories = [...new Set(packs.map((p) => p.category))]

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New pecking order"
      subtitle="Start blank, or let a pack fill the coop for you."
      size="lg"
    >
      <form
        className={styles.newForm}
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <label className={styles.field}>
          <span className="mono">Title</span>
          <input
            className={styles.input}
            data-size="lg"
            placeholder="Best breakfast cereals, ranked"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <fieldset className={styles.presets}>
          <legend className="mono">Tiers</legend>
          {TIER_PRESETS.map((p) => (
            <label key={p.id} className={styles.preset}>
              <input
                type="radio"
                name={name}
                className="sr-only"
                checked={presetId === p.id}
                onChange={() => setPresetId(p.id)}
              />
              <span className={styles.presetBars} aria-hidden>
                {tiersFromPreset(p).map((t) => (
                  <span key={t.id} style={{ background: t.color }} />
                ))}
              </span>
              <span className={styles.presetName}>{p.name}</span>
              <span className={styles.presetLabels}>{p.labels.join(' · ')}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.row}>
          <button type="submit" className={btn.button} data-variant="primary">
            Create blank board <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      </form>

      {packs.length > 0 && (
        <section className={styles.packs} aria-labelledby={`${name}-packs`}>
          <h3 id={`${name}-packs`} className={styles.sectionTitle}>
            Or start from a pack
          </h3>
          {categories.map((cat) => (
            <div key={cat} className={styles.packGroup}>
              <p className="mono">{cat}</p>
              <ul className={styles.packGrid}>
                {packs
                  .filter((p) => p.category === cat)
                  .map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className={styles.pack}
                        style={{ '--accent': accentHex(p.accent) } as React.CSSProperties}
                        onClick={() => void fromPack(p)}
                      >
                        <span className={styles.packTitle}>{p.title}</span>
                        <span className={styles.packDesc}>{p.description}</span>
                        <span className={styles.packMeta}>
                          {p.itemCount} items · {p.sample.slice(0, 3).join(', ')}…
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          <p className={styles.note}>
            Want your favourite topic here?{' '}
            <a
              href="https://github.com/KarthikSubramanian07/Pecking-Order/blob/main/CONTRIBUTING-PACKS.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add a pack
            </a>{' '}
            — it's one JSON file.
          </p>
        </section>
      )}
    </Dialog>
  )
}
