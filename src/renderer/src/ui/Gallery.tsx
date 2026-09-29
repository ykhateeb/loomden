// Every part of the design system on one page. `npm run gallery` opens it; compare it with the boards.
import { type ReactNode, useState } from "react";
import { Avatar, Button, Chip, cx, Dot, IconButton, Kbd, Label, pill, Pill, type PillTone, Spinner } from "./base";
import { Checkbox, Segmented, Switch } from "./controls";
import { SearchInput, TextField } from "./Field";
import { Icon, iconNames, Logo } from "./Icon";
import { Menu } from "./Menu";
import { Modal, ModalIcon } from "./Modal";
import { Bar, Callout, Card, CardBody, CardHeader, ListItem, Table, Td, Th, Toast, Tr } from "./surfaces";
import { Tooltip } from "./Tooltip";

const colors = ["bg", "side", "panel", "raised", "hover", "code", "field", "line", "line2", "fg", "sub", "muted", "dim", "accent", "accent2", "orange", "ok", "warn", "danger", "you", "violet"];
const tones: PillTone[] = ["accent", "ok", "warn", "dim", "orange", "violet", "danger"];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex shrink-0 flex-col gap-3">
      <Label>{title}</Label>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

export function Gallery() {
  const open = location.hash === "#gallery-open"; // shows the menu and the dialog at once, for a check without clicks
  const [seg, setSeg] = useState("medium");
  const [sw, setSw] = useState(true);
  const [cb, setCb] = useState(true);
  const [menu, setMenu] = useState<{ x: number; y: number } | undefined>(open ? { x: 40, y: 120 } : undefined);
  const [modal, setModal] = useState(open);

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="drag flex h-12 shrink-0 items-center gap-3.5 border-b border-line bg-side pr-4 pl-[88px]">
        <div className="flex items-center gap-2 text-md font-[650]"><Logo /><span>Tau · design system</span></div>
      </header>
      <div className="flex flex-col gap-7 overflow-auto p-7">
        <Section title="Colors">
          {colors.map((c) => (
            <div key={c} className="flex w-[88px] flex-col gap-1">
              <div className="h-10 rounded-md border border-line2" style={{ background: `var(--color-${c})` }} />
              <span className="font-mono text-label text-muted">{c}</span>
            </div>
          ))}
        </Section>

        <Section title="Type">
          <div className="flex flex-col gap-1.5">
            <b className="text-xl font-[650]">text-xl 16 — dialog title</b>
            <b className="text-lg">text-lg 15 — session title</b>
            <span className="text-md">text-md 14 — message box</span>
            <span className="text-body">text-body 13.5 — Two requests can both see an expired token before the first refresh ends.</span>
            <span className="text-base">text-base 13 — lists, buttons</span>
            <span className="text-sm text-sub">text-sm 12.5 — sub text</span>
            <span className="text-xs text-muted">text-xs 12 — muted meta</span>
            <span className="text-meta text-muted">text-meta 11.5 — times in lists</span>
            <Label>text-label 11 — label</Label>
            <span className="font-mono">font-mono — pi --session 7f3a91c2</span>
          </div>
        </Section>

        <Section title="Buttons and keys">
          <Button variant="primary">Send<Icon name="send" size={14} /></Button>
          <Button variant="primary">Resume main<Kbd onFill>↵</Kbd></Button>
          <Button>Fork from here<Kbd>F</Kbd></Button>
          <Button variant="ghost">Cancel<Kbd>esc</Kbd></Button>
          <Button variant="danger"><Icon name="trash" size={14} />Remove<Kbd>D</Kbd></Button>
          <Button variant="dangerFill"><Icon name="trash" size={14} />Delete<Kbd onFill>D</Kbd></Button>
          <Button disabled>Disabled</Button>
          <Button small>Small</Button>
          <IconButton label="Attach files"><Icon name="clip" /></IconButton>
          <IconButton label="Add project" bare size={24}><Icon name="plus" /></IconButton>
          <Kbd>⌘K</Kbd>
        </Section>

        <Section title="Pills, chips, dots, avatars">
          {tones.map((t) => <Pill key={t} tone={t}>{t}</Pill>)}
          <button className={pill("accent")}><Spinner size={9} />2 running<Icon name="chevronDown" size={13} /></button>
          <button className={pill("warn")}><Dot color="warn" />1 needs you</button>
          <Chip>@refresh.ts</Chip>
          <span className="flex items-center gap-1.5"><Dot color="ok" />ok</span>
          <Spinner label="loading" />
          <Avatar you /><Avatar />
        </Section>

        <Section title="Inputs">
          <SearchInput className="w-[280px]" icon={<Icon name="search" />} placeholder="Search sessions" hint={<Kbd>⌘K</Kbd>} />
          <TextField className="w-[280px]" label="Name" defaultValue="Rate limit upload API" />
          <TextField className="w-[280px]" label="API key" placeholder="Optional for a local server" hint="Saved in ~/.pi/agent/auth.json" />
          <Segmented label="Thinking level" value={seg} onChange={setSeg} options={["off", "low", "medium", "high"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
          <span className="flex items-center gap-2"><Switch label="bash" on={sw} onChange={setSw} />bash</span>
          <span className="flex items-center gap-2"><Checkbox label="Keys and logins" on={cb} onChange={setCb} />Keys and logins</span>
        </Section>

        <Section title="Cards, list items, callouts">
          <Card className="w-[300px]">
            <CardHeader>Usage<span className="ml-auto font-mono">$0.38</span></CardHeader>
            <CardBody className="flex flex-col gap-2">
              <span className="text-sm"><span className="font-mono">48.2k</span> <span className="text-muted">/ 200k tokens</span></span>
              <Bar percent={24} label="Context used" />
            </CardBody>
          </Card>
          <div className="flex w-[280px] flex-col gap-0.5 rounded-xl bg-side p-2">
            <ListItem meta="17"><span className="text-muted"><Icon name="list" /></span>All sessions</ListItem>
            <ListItem active meta="now"><Spinner /><span className="truncate">Fix flaky token refresh</span></ListItem>
            <ListItem meta="2h"><span className="truncate">Rate limit upload API</span></ListItem>
          </div>
          <div className="flex w-[340px] flex-col gap-2">
            <Callout icon={<Icon name="alert" />}>Extensions run code on your computer. Trust only folders you know.</Callout>
            <Callout tone="info">Project settings win over global ones.</Callout>
          </div>
        </Section>

        <Section title="Table">
          <Card className="w-[720px] overflow-hidden">
            <Table>
              <thead><tr><Th>Session</Th><Th>Project</Th><Th>Model</Th><Th right>Msgs</Th><Th right>Updated</Th></tr></thead>
              <tbody>
                <Tr selected><Td>Split settings screen <span className="rounded-[3px] bg-accent/30 px-0.5 text-fg">refresh</span></Td><Td>orbit-web</Td><Td className="font-mono">claude-opus-5-5</Td><Td right>31</Td><Td right>tue</Td></Tr>
                <Tr><Td>Offline queue for order sync</Td><Td>mobile-app</Td><Td className="font-mono">gpt-5</Td><Td right>27</Td><Td right>mon</Td></Tr>
              </tbody>
            </Table>
          </Card>
        </Section>

        <Section title="Menu, tooltip, dialog, toasts">
          <Button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4 }); }}>Open session menu</Button>
          <Tooltip text={<>A branch · <span className="font-semibold text-tip-acc">click to open it</span></>}>
            <Button>Hover for tooltip</Button>
          </Tooltip>
          <Button onClick={() => setModal(true)}>Open dialog</Button>
          <Toast icon={<span className="text-ok"><Icon name="check" /></span>}>Session renamed</Toast>
          <Toast level="error" icon={<span className="text-danger"><Icon name="alert" /></span>}>prompts/review.md: permission denied</Toast>
        </Section>

        <Section title={`Icons (${iconNames.length})`}>
          {iconNames.map((n) => (
            <div key={n} className="flex w-[88px] flex-col items-center gap-1">
              <Icon name={n} size={18} />
              <span className={cx("font-mono text-label text-muted")}>{n}</span>
            </div>
          ))}
        </Section>
      </div>

      {menu && (
        <Menu
          at={menu}
          label="Session"
          onClose={() => setMenu(undefined)}
          items={[
            { label: "Open", shortcut: "↵", onSelect: () => {} },
            { label: "Rename…", shortcut: "R", onSelect: () => {} },
            "sep",
            { label: "Fork", shortcut: "F", onSelect: () => {} },
            { label: "Clone", shortcut: "C", onSelect: () => {} },
            { label: "Share link", shortcut: "S", disabled: true, onSelect: () => {} },
            "sep",
            { label: "Delete…", shortcut: "D", danger: true, onSelect: () => {} },
          ]}
        />
      )}
      {modal && (
        <Modal
          title="Delete this session?"
          icon={<ModalIcon tone="danger"><Icon name="trash" size={18} /></ModalIcon>}
          onClose={() => setModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setModal(false)}>Cancel<Kbd>esc</Kbd></Button>
              <span className="flex-1" />
              <Button variant="dangerFill" autoFocus onClick={() => setModal(false)}><Icon name="trash" size={14} />Delete<Kbd onFill>D</Kbd></Button>
            </>
          }
        >
          <span>The session file goes to the Trash. You can get it back from there.</span>
        </Modal>
      )}
    </div>
  );
}
