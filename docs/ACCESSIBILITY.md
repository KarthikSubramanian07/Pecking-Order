# Accessibility

Pecking Order aims to conform to **WCAG 2.2 at level AA**. Everything you can do with a mouse or a finger, you can do with a keyboard, and changes to the board are announced to screen readers without moving focus.

This page says what was tested, how to drive the app from the keyboard, and what we know is still imperfect. If something gets in your way, please [open an issue](https://github.com/KarthikSubramanian07/Pecking-Order/issues); accessibility bugs are treated as bugs, not wishes.

## What was tested

The audit ran in Chromium (Playwright) against a production build, in the light and dark themes, at 320, 390, 640 and 1280 CSS pixels wide.

| Area            | How                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automated rules | axe-core with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags on the home page (template gallery, category filters, your boards), the empty board, a populated board, a tap-to-place selection, toasts, the tier settings popover, the settings menu, every dialog and a Peck-off in progress. No serious or critical violations. |
| Colour contrast | Every token pair measured in the browser, including tier washes for all ten swatches. Text is at least 4.5:1. Field boundaries, focus rings, the selection ring and the dashed egg outlines are at least 3:1.                                                                                                                                        |
| Keyboard        | Tab order, visible focus, focus that is never hidden behind the docked Coop, keyboard dragging between rows, number-key moves, undo, Escape on every dialog and popover, arrow keys in menus and tabs.                                                                                                                                               |
| Pointer         | Every target is at least 24 by 24 pixels (inline links in sentences excepted). Dragging always has a single-pointer alternative: tap an item, then tap **Place here**.                                                                                                                                                                               |
| Reflow and zoom | No horizontal scrolling at 320 pixels. At 200% zoom on a laptop, and in landscape on a phone, the Coop joins the page flow instead of covering the board. Text spacing overrides (WCAG 1.4.12) do not clip controls.                                                                                                                                 |
| Motion          | With `prefers-reduced-motion`, the hatch, peck, row and tilt animations are off and the drag drops without animating. Nothing flashes.                                                                                                                                                                                                               |
| Screen readers  | Names, roles and states checked through the accessibility tree: sortable tiles carry `aria-roledescription` and drag instructions, theme and tile size are radio menu items with `aria-checked`, the board title is the page's only `h1` and also the document title.                                                                                |

The automated part of this lives in [`e2e/app-a11y.spec.ts`](../e2e/app-a11y.spec.ts) and runs in CI on every pull request, on a desktop and a phone-sized viewport.

## Keyboard map

| Keys                                                               | What they do                                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| <kbd>Tab</kbd>, <kbd>Shift</kbd>+<kbd>Tab</kbd>                    | Move between controls. The first stop is a "Skip to board" link.                                                    |
| <kbd>Space</kbd> or <kbd>Enter</kbd> on an item                    | Pick it up. Press again to drop it. While you carry it, the Coop leaves the bottom dock so every tier is reachable. |
| <kbd>↑</kbd> <kbd>↓</kbd> while carrying                           | Move to the row above or below (tiers, then the Coop).                                                              |
| <kbd>←</kbd> <kbd>→</kbd> while carrying                           | Move along the row.                                                                                                 |
| <kbd>Esc</kbd> while carrying                                      | Put it back where it was.                                                                                           |
| <kbd>1</kbd> to <kbd>9</kbd> on an item                            | Send it to that tier, top to bottom. Focus stays on the item.                                                       |
| <kbd>0</kbd> on an item                                            | Send it back to the Coop.                                                                                           |
| <kbd>E</kbd> or <kbd>F2</kbd> on an item                           | Edit its label.                                                                                                     |
| <kbd>Delete</kbd> or <kbd>Backspace</kbd> on an item               | Remove it. Focus moves to the next item.                                                                            |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> (<kbd>⌘</kbd>+<kbd>Z</kbd> on a Mac)  | Undo. Add <kbd>Shift</kbd> to redo.                                                                                 |
| <kbd>Enter</kbd> in the quick-add field                            | Add the typed item. Pasting several lines adds one item per line.                                                   |
| <kbd>?</kbd>                                                       | Show the shortcuts.                                                                                                 |
| <kbd>Esc</kbd> in a dialog, menu or popover                        | Close it and return focus to the control that opened it.                                                            |
| <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Home</kbd> <kbd>End</kbd> in a menu | Move between items.                                                                                                 |
| <kbd>←</kbd> <kbd>→</kbd> in Peck-off                              | Pick the left or right item. <kbd>↓</kbd> or <kbd>=</kbd> for "can't decide", <kbd>Backspace</kbd> to undo a pick.  |

## Announcements

- Picking up, moving and dropping an item is announced with its row and position ("Banana is in tier A, position 1 of 3").
- Moves, removals and undoable actions appear as toasts in a polite live region. Undo is also always available from the toolbar and with <kbd>Ctrl</kbd>+<kbd>Z</kbd>, so the toast's own Undo button is a shortcut, not the only way back.
- Items added from the quick-add field are announced ("Added 3 items to the Coop").
- Saving happens on every change and is silent; only a failure to save is announced.
- Image search announces how many pictures it found, and errors are announced as alerts.

## Known limitations

- **Toasts disappear on a timer** (3.5 seconds, 6 with an action). Their messages are announced when they appear and every action they offer is available elsewhere, but you cannot pause them.
- **Long labels are clamped on tiles** to four lines. The full label is the tile's accessible name and is shown in the edit dialog (<kbd>E</kbd>).
- **Pointer dragging needs a precise pointer.** Use tap-to-place or the number keys if dragging is awkward.
- **Exported images are pictures.** A PNG has no text alternative, so when you post one, include the ranking as text too.
- **Image search results come from third parties.** Thumbnails have no descriptions beyond their titles, which are shown on each result and used as the item label.
- Testing was done with Chromium and the accessibility tree. It has not yet been checked by hand with every screen reader and browser pairing; reports from VoiceOver, NVDA, JAWS and TalkBack users are very welcome.
