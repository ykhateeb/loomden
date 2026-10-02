import { useEffect, useRef, useState } from "react";
import type { ModelChoice } from "#protocol";
import { agoText } from "#renderer/sessions/time";
import { actions } from "#renderer/actions";
import { useStore } from "#renderer/store";
import { Button, cx, IconButton, Kbd, LinkButton, pill, Pill } from "#renderer/ui/base";
import { Segmented } from "#renderer/ui/controls";
import { Icon } from "#renderer/ui/Icon";
import { checkMark, Menu, menuBelow, type MenuItem, type MenuState } from "#renderer/ui/Menu";
import { ProvidersCard } from "./ProvidersCard";
import { Bar, Card, CardBody, CardHeader, ListItem } from "#renderer/ui/surfaces";
import { folderName, home } from "#renderer/chat/format";

const MAIN_PROVIDERS = ["anthropic", "openai", "google", "openrouter"];
const THINKING_LEVELS = ["off", "low", "medium", "high"];


/** Board 5: the model new sessions start with, the providers pi can call, and the ⌃P favorites. */
export function ModelsPage() {
  const page = useStore((s) => s.modelsPage);
  const projects = useStore((s) => s.projects);
  const savedAt = useStore((s) => s.savedAt);
  const [scopeRaw, setScope] = useState<"global" | "project">("global");
  // No project to edit: Project is not offered (edits would go to the global file).
  const scope = projects.length ? scopeRaw : "global";
  const [project, setProject] = useState<string>();
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState<MenuState>();
  const main = useRef<HTMLElement>(null);
  // A picked project that is gone from the list falls back to the first one.
  const cwd = scope === "project" ? (projects.some((p) => p.cwd === project) ? project : projects[0]?.cwd) : undefined;
  const error = useStore((s) => s.modelsError);

  useEffect(() => void actions.loadModels(cwd), [cwd]);
  if (!page)
    return (
      <main className="flex flex-col items-center justify-center gap-3 text-muted">
        {error ? <><span className="text-danger">{error}</span><Button small onClick={() => actions.loadModels(cwd)}>Try again</Button></> : "Reading settings…"}
      </main>
    );

  const settings = page.settings;
  const effective = { ...page.global, ...Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined)) };
  const providers = page.providers;
  const shown = providers.filter((p) => more || p.configured || MAIN_PROVIDERS.includes(p.id) || p.custom);
  const rest = providers.filter((p) => !shown.includes(p));
  const ready = shown.filter((p) => p.configured).length;
  const favorites = settings.enabledModels ?? [];
  const menuBelow = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 6 };
  };
  const modelItems = (pick: (m: ModelChoice) => void, current?: string): MenuItem[] =>
    page.models.length
      ? page.models.map((m) => ({ id: `${m.provider}/${m.id}`, label: m.id, meta: m.provider, icon: checkMark(`${m.provider}/${m.id}` === current), onSelect: () => pick(m) }))
      : [{ label: "No models yet: add a provider key below", disabled: true, onSelect: () => {} }];
  const scrollToSection = (id: string) => main.current?.querySelector(`#${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });


  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_300px]">
      <main ref={main} className="flex min-h-0 flex-col gap-5 overflow-auto px-7 py-6 [&>*]:shrink-0">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] font-[650]">Models &amp; providers</h1>
          <span className="text-muted">Pick the model new sessions start with, and connect the providers pi can call.</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-muted">Edit</span>
          {projects.length > 0 ? (
            <Segmented label="Edit" value={scope} onChange={setScope} options={[{ value: "global", label: "Global" }, { value: "project", label: "Project" }]} />
          ) : (
            <Pill tone="dim">Global</Pill>
          )}
          {scope === "project" && (
            <button className={pill("dim", "hover:text-fg")} disabled={!projects.length} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => setMenu({ at: menuBelow(e), label: "Project", items: projects.map((p) => ({ id: p.cwd, label: p.name, icon: checkMark(p.cwd === cwd), onSelect: () => setProject(p.cwd) })) })}>
              <Icon name="folder" size={12} />{cwd ? folderName(cwd) : "no project"}<Icon name="chevronDown" size={12} />
            </button>
          )}
          <span className="text-sm text-muted">Project settings win over global ones.</span>
        </div>

        <div id="default-model" className="grid grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Default model</span>
            <button
              className="flex h-9 items-center gap-2 rounded-md border border-line2 bg-field px-3 text-left text-body hover:border-accent-line"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => setMenu({ at: menuBelow(e), label: "Default model", items: [...modelItems((m) => actions.setModels({ defaultProvider: m.provider, defaultModel: m.id }, cwd), settings.defaultProvider && `${settings.defaultProvider}/${settings.defaultModel}`), ...(scope === "project" && settings.defaultModel ? ["sep" as const, { label: "Use the global default", onSelect: () => actions.setModels({ defaultProvider: null, defaultModel: null }, cwd) }] : [])] })}
            >
              <span className="text-accent"><Icon name="sparkle" size={14} /></span>
              <b className="truncate font-semibold">{effective.defaultModel ?? "pi picks one"}</b>
              <span className="text-muted">{effective.defaultProvider}</span>
              {scope === "project" && !settings.defaultModel && <Pill tone="dim" className="h-5 text-label">from global</Pill>}
              <span className="ml-auto text-muted"><Icon name="chevronDown" size={13} /></span>
            </button>
          </div>
          <div id="thinking" className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">Thinking level{scope === "project" && !settings.defaultThinkingLevel && " · from global"}</span>
            <Segmented
              label="Thinking level"
              value={effective.defaultThinkingLevel ?? "medium"}
              onChange={(v) => actions.setModels({ defaultThinkingLevel: v }, cwd)}
              options={THINKING_LEVELS.map((l) => ({ value: l, label: l[0].toUpperCase() + l.slice(1) }))}
            />
          </div>
        </div>

        <ProvidersCard shown={shown} rest={rest} onShowMore={() => setMore(true)} openMenu={setMenu} />

        <Card>
          <div id="quick-switch" />
          <CardHeader>
            Quick switch
            <span className="ml-1 flex items-center gap-1 text-xs font-normal text-muted">favorites you cycle with <Kbd>⌃P</Kbd> · <Kbd>⌃L</Kbd> opens the full list</span>
          </CardHeader>
          <CardBody className="flex flex-wrap items-center gap-2">
            {favorites.length === 0 && <span className="text-sm text-muted">{scope === "project" && page.global.enabledModels?.length ? "Uses the global favorites." : "No favorites: ⌃P cycles every model."}</span>}
            {favorites.map((f) => (
              <span key={f} className={pill("dim", "h-7 rounded-md pr-1")}>
                <span className="text-accent"><Icon name="sparkle" size={12} /></span>
                {f}
                <IconButton bare size={20} label={`Remove ${f}`} onClick={() => actions.setModels({ enabledModels: favorites.filter((x) => x !== f) }, cwd)}><Icon name="x" size={12} /></IconButton>
              </span>
            ))}
            <LinkButton
              className="flex items-center gap-1 text-sm"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => setMenu({ at: menuBelow(e), label: "Add model", items: modelItems((m) => actions.setModels({ enabledModels: [...new Set([...favorites, `${m.provider}/${m.id}`])] }, cwd)) })}
            >
              <Icon name="plus" size={12} />Add model
            </LinkButton>
          </CardBody>
        </Card>
      </main>

      <aside className="flex min-h-0 flex-col gap-3 overflow-auto border-l border-line bg-side p-3.5 [&>*]:shrink-0">
        <Card>
          <CardHeader>On this page</CardHeader>
          <CardBody className="flex flex-col gap-0.5 p-2 pt-2">
            {[["default-model", "Default model"], ["thinking", "Thinking level"], ["providers", "Providers"], ["quick-switch", "Quick switch"]].map(([id, label]) => (
              <ListItem key={id} onClick={() => scrollToSection(id)}>{label}</ListItem>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader>Providers<span className="ml-auto text-xs font-normal text-muted">{ready} of {shown.length} ready</span></CardHeader>
          <CardBody><Bar percent={shown.length ? (ready / shown.length) * 100 : 0} label="Providers ready" /></CardBody>
        </Card>
        <Card>
          <CardHeader>Saved to</CardHeader>
          <CardBody className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col">
              <span className="font-mono text-xs text-fg">{home(page.file)}</span>
              <span className="text-xs text-muted">{scope === "global" ? "Global · every project" : "This project"}</span>
            </div>
            {scope === "global" && (
              <div className="flex flex-col">
                <span className="text-xs text-muted">A project saves to</span>
                <span className="font-mono text-xs text-fg">&lt;project&gt;/.pi/settings.json</span>
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs text-muted">Keys and logins go to</span>
              <span className="font-mono text-xs text-fg">~/.pi/agent/auth.json</span>
              <span className="text-xs text-muted">Shared with terminal pi. Keep it private.</span>
            </div>
            {savedAt && <span className={cx("flex items-center gap-1.5 text-xs text-ok")}><Icon name="check" size={12} />Saved {agoText(savedAt)}</span>}
          </CardBody>
        </Card>
      </aside>

      {menu && <Menu at={menu.at} label={menu.label} items={menu.items} width={menu.label === "Default model" || menu.label === "Add model" ? 320 : 240} onClose={() => setMenu(undefined)} />}
    </div>
  );
}
