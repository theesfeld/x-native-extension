/**
 * Plan viewport crops that cover a post from top to bottom without gaps.
 * Coordinates are CSS pixels. scrollY is the document scroll offset to use
 * before each capture.
 *
 * @param {{
 *   postTop: number,
 *   postHeight: number,
 *   postLeft: number,
 *   postWidth: number,
 *   viewportWidth: number,
 *   viewportHeight: number,
 *   obstructionTop?: number,
 *   obstructionBottom?: number,
 *   maxSlices?: number,
 *   maxCssHeight?: number,
 * }} input
 */
export function planVerticalSlices(input) {
  const obstructionTop = input.obstructionTop || 0;
  const obstructionBottom = input.obstructionBottom || 0;
  const maxSlices = input.maxSlices ?? 10;
  const maxCssHeight = input.maxCssHeight ?? 14000;
  const postTop = input.postTop;
  const postBottom = postTop + input.postHeight;
  const viewportWidth = input.viewportWidth;
  const viewportHeight = input.viewportHeight;

  const viewLeft = Math.max(input.postLeft, 0);
  const viewRight = Math.min(input.postLeft + input.postWidth, viewportWidth);
  const viewWidth = viewRight - viewLeft;
  const widthClipped = input.postLeft < -0.5 || input.postLeft + input.postWidth > viewportWidth + 0.5;

  /** @type {Array<{ scrollY: number, viewX: number, viewY: number, viewWidth: number, viewHeight: number, docTop: number, docBottom: number }>} */
  const slices = [];
  if (viewWidth < 1 || input.postHeight < 1 || viewportHeight < 1) {
    return { slices, truncated: false, widthClipped, covered: 0, total: input.postHeight };
  }

  let scrollY = postTop - obstructionTop;
  if (scrollY < 0) scrollY = 0;
  let coveredBottom = postTop;
  let truncated = false;

  for (let i = 0; i < maxSlices; i++) {
    const visibleTop = Math.max(postTop, scrollY + obstructionTop, coveredBottom);
    const visibleBottom = Math.min(postBottom, scrollY + viewportHeight - obstructionBottom);
    const height = visibleBottom - visibleTop;
    if (height < 1) break;
    if (coveredBottom - postTop + height > maxCssHeight + 0.5) {
      truncated = true;
      break;
    }
    slices.push({
      scrollY,
      viewX: viewLeft,
      viewY: visibleTop - scrollY,
      viewWidth,
      viewHeight: height,
      docTop: visibleTop,
      docBottom: visibleBottom,
    });
    coveredBottom = visibleBottom;
    if (coveredBottom >= postBottom - 0.5) break;
    const next = scrollY + height;
    if (next <= scrollY + 0.5) break;
    scrollY = next;
    if (i === maxSlices - 1 && coveredBottom < postBottom - 1) truncated = true;
  }

  if (coveredBottom < postBottom - 1) truncated = true;
  return {
    slices,
    truncated,
    widthClipped,
    covered: Math.max(0, coveredBottom - postTop),
    total: input.postHeight,
  };
}
