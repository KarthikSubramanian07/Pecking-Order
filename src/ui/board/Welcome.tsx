import { FolderSimplePlus, ImageSquare, MagnifyingGlass, Sparkle } from '@phosphor-icons/react'
import { useUiStore } from '@/state/uiStore'
import { Hen } from '../brand/Hen'
import { isMac } from '../chrome/keys'
import { useIngest } from '../hooks/useIngest'
import btn from '../primitives/Button.module.css'
import styles from './Welcome.module.css'

/** First-run card for an empty board: every way to get items in, one glance. */
export function Welcome() {
  const open = useUiStore((s) => s.open)
  const { upload } = useIngest()
  return (
    <section className={styles.welcome} aria-labelledby="welcome-title">
      <Hen size={84} mood="peck" className={styles.hen} />
      <div className={styles.copy}>
        <h2 id="welcome-title" className={styles.lede}>
          Every list starts as an egg.
        </h2>
        <p className={styles.sub}>
          Drop images or a whole folder anywhere on the page, paste with{' '}
          <kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd>
          <kbd>V</kbd>, type a list into the Coop below, or let a pack fill it for you.
        </p>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={btn.button}
          data-variant="primary"
          onClick={() => void upload()}
        >
          <ImageSquare size={18} aria-hidden /> Upload images
        </button>
        <button type="button" className={btn.button} onClick={() => void upload(true)}>
          <FolderSimplePlus size={18} aria-hidden /> Add a folder
        </button>
        <button type="button" className={btn.button} onClick={() => open('search')}>
          <MagnifyingGlass size={18} aria-hidden /> Search free images
        </button>
        <button
          type="button"
          className={btn.button}
          data-variant="accent"
          onClick={() => open('new')}
        >
          <Sparkle size={18} aria-hidden /> Start from a pack
        </button>
      </div>
    </section>
  )
}
