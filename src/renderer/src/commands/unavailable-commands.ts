/**
 * Menu items that are greyed on purpose, and say why.
 *
 * These are not unfinished. Each is something this editor could draw on screen
 * but could not write back to the file, so implementing it would trade a greyed
 * menu item for silent data loss the next time the document was saved. The menu
 * shows unavailable items rather than hiding them, so the honest thing is to
 * show them with a reason attached.
 *
 * They are gathered here rather than registered alongside working commands so
 * the coverage script can count them separately: a command that exists and
 * refuses to run is not an implemented menu item, and a report claiming
 * 140 of 140 would be worth less than one claiming 135.
 */
import { registerAll, type Command } from './registry'

const unavailable: Command[] = [
  /**
   * Block math.
   *
   * The editor's schema has `math_inline` and no block equivalent. Inserting
   * one would produce a node nothing renders and nothing serializes.
   */
  {
    id: 'para.mathBlock',
    enabled: () => false,
    disabledReason: 'Block math is not modelled by this editor; inline math is.',
    run: () => {},
  },
  {
    id: 'edit.mathBlock',
    enabled: () => false,
    disabledReason: 'Block math is not modelled by this editor; inline math is.',
    run: () => {},
  },

  /**
   * Toggle Math Preview.
   *
   * Inline math already shows its source when the caret is inside it and
   * renders when the caret leaves. A global toggle would fight that, and the
   * two would disagree about what the caret means.
   */
  {
    id: 'edit.mathPreview',
    enabled: () => false,
    disabledReason: 'Math already shows its source while the caret is inside it.',
    run: () => {},
  },

  /**
   * Link Reference.
   *
   * Reference links parse correctly, but the definition is inlined when the
   * document is written back — the round-trip corpus lists it among the
   * constructs we knowingly normalize. A command to create one would be undone
   * by the first save.
   */
  {
    id: 'para.linkReference',
    enabled: () => false,
    disabledReason: 'Reference links are rewritten as inline links when the file is saved.',
    run: () => {},
  },

  /** Import needs Pandoc, which this build deliberately does not bundle. */
  {
    id: 'file.import',
    enabled: () => false,
    disabledReason: 'Importing other formats needs Pandoc, which this build does not include.',
    run: () => {},
  },
]

/** The ids declared here, for the test that keeps this file and the menu honest. */
export const UNAVAILABLE_IDS = unavailable.map((c) => c.id)

export function registerUnavailableCommands(): void {
  registerAll(unavailable)
}
