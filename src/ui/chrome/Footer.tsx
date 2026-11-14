import { Coffee, GithubLogo } from '@phosphor-icons/react'
import styles from './Footer.module.css'

export function Footer() {
  return (
    <footer className={styles.footer}>
      <p>Ranked with care by a very opinionated hen. Everything stays on this device.</p>
      <nav aria-label="Site">
        <a href="/about/">About</a>
        <a href="/privacy/">Privacy</a>
        <a
          href="https://github.com/KarthikSubramanian07/Pecking-Order"
          rel="noopener noreferrer"
          target="_blank"
        >
          <GithubLogo size={15} aria-hidden /> Source
        </a>
        <a href="https://buymeacoffee.com/winnerkarthik" rel="noopener noreferrer" target="_blank">
          <Coffee size={15} aria-hidden /> Buy me a coffee
        </a>
      </nav>
    </footer>
  )
}
