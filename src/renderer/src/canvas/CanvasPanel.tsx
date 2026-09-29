/** Design boards C4 and C6: the canvas next to the chat. The page comes from the tau-canvas extension's local server. */
export function CanvasPanel({ url }: { url: string }) {
  return (
    <aside aria-label="Design canvas" className="flex min-h-0 min-w-0 flex-col border-l border-line bg-side">
      <iframe title="Design canvas" src={url} className="min-h-0 flex-1 border-0" />
    </aside>
  );
}
