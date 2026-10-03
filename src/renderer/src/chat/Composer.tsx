import { useEffect, useId, useRef, useState } from "react";
import type { LiveState } from "#protocol";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, IconButton, Kbd, pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import type { Behavior } from "./actions";
import { CommandMenu, type Row } from "./CommandMenu";
import { applyPick, folderName, splitAttachments } from "./format";
import { ModelPicker } from "./ModelPicker";
import { QueueList } from "./QueueList";
import { useTriggerMenu } from "./useTriggerMenu";

/** Board 2, 2b, 2c: the message box — queue, attachments, / and @ menus, model and thinking, drop files. */
export function Composer({ sessionKey, state }: { sessionKey: string; state: LiveState }) {
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [images, setImages] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const listId = useId();
  const queued = state.queued;
  const [sending, setSending] = useState(false);

  // A user message pi gave back (after "Continue from here" or a fork) goes in the box to edit and send.
  const draft = useStore((s) => s.drafts[sessionKey]);
  useEffect(() => {
    if (draft === undefined) return;
    actions.clearDraft(sessionKey);
    setText(draft);
    setCaret(draft.length);
    requestAnimationFrame(() => (box.current?.focus(), box.current?.setSelectionRange(draft.length, draft.length)));
  }, [draft, sessionKey]);

  const list = useTriggerMenu({ sessionKey, cwd: state.cwd, text, caret });
  const { trigger, rows, current } = list;
  const listOpen = !!trigger;

  const edit = (next: string, at = next.length) => {
    setText(next);
    setCaret(at);
    list.reset();
    requestAnimationFrame(() => box.current?.setSelectionRange(at, at));
  };

  const pick = (row: Row) => {
    if (!trigger) return;
    const r = applyPick(text, trigger, row.value);
    edit(r.text, r.caret);
  };

  // While pi works: Enter steers the current run (as in terminal pi), ⌥Enter waits for the run to end.
  // The text and images stay until pi accepts them, so a failed send (a moved image) loses nothing.
  const send = async (behavior: NonNullable<Behavior>) => {
    if ((!text.trim() && images.length === 0) || sending) return;
    setSending(true);
    const [sentText, sentImages] = [text, images];
    // Clear only what was sent: text typed while pi checked the message stays.
    const clearSent = () => {
      setImages((now) => now.filter((p) => !sentImages.includes(p)));
      setText((now) => {
        if (now !== sentText) return now;
        requestAnimationFrame(() => box.current?.setSelectionRange(0, 0));
        return "";
      });
      setCaret(0);
    };
    await actions.prompt({ key: sessionKey, text: sentText, behavior: state.streaming ? behavior : undefined, images: sentImages, onAccepted: clearSent });
    setSending(false);
  };

  const takeBack = () => {
    // ponytail: the queue as the last state showed it; a message pi takes in the same moment also comes back to the box.
    const back = queued;
    actions.dequeue(sessionKey);
    setImages((old) => [...new Set([...back.flatMap((b) => b.images), ...old])]);
    edit([...back.map((b) => b.text), text].filter(Boolean).join("\n"));
  };

  const attach = (paths: string[]) => {
    const { images: added, refs } = splitAttachments(paths, state.cwd);
    setImages((old) => [...old, ...added.filter((p) => !old.includes(p))]);
    if (refs.length) edit(`${text}${text && !text.endsWith(" ") ? " " : ""}${refs.join(" ")} `);
    box.current?.focus();
  };

  const pickFiles = async () => attach(await actions.pickFiles());

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // Enter confirms an input-method word, it does not send
    if (listOpen && rows.length > 0) {
      if (e.key === "ArrowDown") return e.preventDefault(), list.move(1);
      if (e.key === "ArrowUp") return e.preventDefault(), list.move(-1);
      if (e.key === "Tab") return e.preventDefault(), pick(rows[current]);
      // ↵ on a file only completes it; on a / command it runs the picked command.
      if (e.key === "Enter" && !e.shiftKey && trigger?.kind === "@") return e.preventDefault(), pick(rows[current]);
      if (e.key === "Enter" && !e.shiftKey && trigger?.kind === "/" && rows[current].value !== trigger.query) {
        e.preventDefault();
        actions.prompt({ key: sessionKey, text: `/${rows[current].value}`, behavior: state.streaming ? "steer" : undefined });
        return edit("");
      }
    }
    if (listOpen && e.key === "Escape") return e.preventDefault(), list.close();
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e.altKey ? "followUp" : "steer");
    }
    if (e.key === "Escape" && state.streaming) actions.abort(sessionKey);
  };

  return (
    <div className="shrink-0 px-[22px] pt-3.5 pb-[18px]">
      <div
        className={cx("relative rounded-xl border bg-panel shadow-[0_8px_24px_rgba(0,0,0,.25)] focus-within:border-accent focus-within:shadow-focus", dragging ? "border-accent" : "border-line2")}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = [...e.dataTransfer.files];
          for (const f of files) window.tenon.grantDrop(f);
          attach(files.map((f) => window.tenon.pathForFile(f)).filter(Boolean));
        }}
      >
        {listOpen && <CommandMenu id={listId} title={trigger.kind === "/" ? "Commands" : "Files"} rows={rows} active={current} onPick={pick} onHover={list.setActive} />}

        <QueueList queued={queued} onTakeBack={takeBack} />

        {images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {images.map((p) => (
              <span key={p} className={pill("dim", "h-7 rounded-md pr-1")} title={p}>
                <Icon name="image" size={13} />
                {folderName(p)}
                <IconButton bare size={20} label={`Remove ${folderName(p)}`} onClick={() => setImages(images.filter((x) => x !== p))}>
                  <Icon name="x" size={12} />
                </IconButton>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={box}
          aria-label="Message to pi"
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={listOpen && rows.length ? `${listId}-${current}` : undefined}
          placeholder={state.streaming ? "Steer pi…   ⌥↵ queues it for after this run" : "Reply to pi…   @ adds a file · / runs a command · drop files to attach"}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart);
            list.reset();
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          className="block max-h-60 min-h-12 w-full resize-none bg-transparent px-3.5 pt-3 pb-2 text-md outline-none [field-sizing:content]"
        />

        {listOpen ? (
          <div className="flex items-center gap-1.5 px-3.5 pb-3 text-xs text-muted">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> pick · <Kbd>tab</Kbd> complete · <Kbd>↵</Kbd> {trigger.kind === "/" ? "run" : "add"} · <Kbd>esc</Kbd> close
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
            <ModelPicker sessionKey={sessionKey} state={state} />
            <IconButton size={28} label="Attach files" onClick={pickFiles}>
              <Icon name="clip" />
            </IconButton>
            <span className="flex-1" />
            {state.streaming && (
              <Button small variant="danger" onClick={() => actions.abort(sessionKey)}>
                <Icon name="stop" size={14} />Stop
              </Button>
            )}
            <Button small variant="primary" disabled={sending || (!text.trim() && images.length === 0)} onClick={() => send("steer")}>
              Send<Icon name="send" size={14} />
            </Button>
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-accent bg-accent-bg text-center backdrop-blur-sm">
            <b className="flex items-center gap-2 text-md text-fg"><Icon name="clip" />Drop to attach</b>
            <span className="text-sm text-sub">Images go in as pictures · text files as @file references</span>
          </div>
        )}
      </div>
    </div>
  );
}
