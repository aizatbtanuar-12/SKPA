/**
 * Keep the app working when the browser translates the page (Chrome "Translate to English").
 *
 * The translator replaces our text nodes with its own <font> copies. When React later
 * removes or inserts next to one of the original text nodes, the DOM throws
 * "Failed to execute 'removeChild' on 'Node'", React unmounts everything and the
 * screen goes blank (seen on Anak Saya). These guards make those two calls tolerant:
 * a node that is no longer where React expects it is skipped instead of crashing.
 */
export function installTranslateGuard() {
  if (typeof Node !== 'function' || !Node.prototype) return
  const proto = Node.prototype as Node & { __pibgGuard?: boolean }
  if (proto.__pibgGuard) return
  proto.__pibgGuard = true

  const removeChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      // the translator moved / replaced it; remove it from wherever it is now (if anywhere)
      if (child.parentNode) child.parentNode.removeChild(child)
      return child
    }
    return removeChild.call(this, child) as T
  }

  const insertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return insertBefore.call(this, node, null) as T
    return insertBefore.call(this, node, ref) as T
  }
}
