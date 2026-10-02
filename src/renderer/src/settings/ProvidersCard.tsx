import type { ProviderRow } from "#protocol";
import { actions } from "#renderer/actions";
import { plural } from "#renderer/chat/format";
import { useStore } from "#renderer/store";
import { Button, Dot, LinkButton, Pill } from "#renderer/ui/base";
import { Icon } from "#renderer/ui/Icon";
import { menuBelow, type MenuState } from "#renderer/ui/Menu";
import { Card, CardBody, CardHeader, Table, Td, Th, Tr } from "#renderer/ui/surfaces";

/** Board 5: the providers, how each one is connected, and the action to connect it. */
export function ProvidersCard({ shown, rest, onShowMore, openMenu }: {
  shown: ProviderRow[];
  /** The providers that "Show more providers" adds. */
  rest: ProviderRow[];
  onShowMore: () => void;
  openMenu: (menu: MenuState) => void;
}) {
  const login = useStore((s) => s.login);
  const action = (p: ProviderRow) => {
    if (p.configured)
      return (
        <Button small variant="ghost" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openMenu({ at: menuBelow(e), label: p.name, items: [
          ...(p.canKey ? [{ label: "Replace key…", icon: <Icon name="key" />, onSelect: () => actions.login(p.id, "api_key") }] : []),
          ...(p.canLogin ? [{ label: "Log in again…", icon: <Icon name="external" />, onSelect: () => actions.login(p.id, "oauth") }] : []),
          "sep",
          { label: "Log out", icon: <Icon name="x" />, danger: true, disabled: p.source !== "stored", onSelect: () => actions.logout(p.id) },
          ...(p.source === "environment" ? [{ note: "This key comes from an environment variable: remove it there." }] : []),
        ] })}>Manage</Button>
      );
    if (p.canLogin && p.canKey)
      return (
        <Button small variant="ghost" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => openMenu({ at: menuBelow(e), label: p.name, items: [
          { label: "Log in with a subscription", icon: <Icon name="external" />, onSelect: () => actions.login(p.id, "oauth") },
          { label: "Add an api key", icon: <Icon name="key" />, onSelect: () => actions.login(p.id, "api_key") },
        ] })}>Connect<Icon name="chevronDown" size={12} /></Button>
      );
    if (p.canLogin) return <Button small variant="ghost" onClick={() => actions.login(p.id, "oauth")}>Log in</Button>;
    if (p.canKey) return <Button small variant="ghost" onClick={() => actions.login(p.id, "api_key")}>Add key</Button>;
    return null;
  };

  return (
    <Card>
      <div id="providers" />
      <CardHeader>Providers<span className="ml-1 text-xs font-normal text-muted">api key or subscription</span></CardHeader>
      <CardBody className="p-0 pt-2.5">
        <Table>
          <thead><tr><Th>Provider</Th><Th>Detail</Th><Th>Status</Th><Th right /></tr></thead>
          <tbody>
            {shown.map((p) => (
              <Tr key={p.id} selected={login?.providerId === p.id}>
                <Td>
                  <span className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-[9px] bg-raised text-xs font-bold text-sub">{p.name[0]}</span>
                    <b className="font-semibold text-fg">{p.name}</b>
                    {p.custom && <Pill tone="dim" className="h-5 text-label">custom</Pill>}
                  </span>
                </Td>
                <Td className="max-w-[280px] truncate">{detail(p)}</Td>
                <Td>
                  <span className="flex items-center gap-2">
                    <Dot color={p.configured ? "ok" : "dim"} />
                    <span className={p.configured ? "text-ok" : "text-muted"}>{p.configured ? "Connected" : "Not connected"}</span>
                  </span>
                </Td>
                <Td right>{action(p)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <div className="flex items-center gap-2 px-4 py-3 text-sm">
          {rest.length > 0 && (
            <>
              <LinkButton className="flex shrink-0 items-center gap-1 text-sm whitespace-nowrap" onClick={onShowMore}><Icon name="chevronDown" size={12} />Show more providers</LinkButton>
              <span className="truncate text-muted">{rest.slice(0, 6).map((p) => p.id).join(" · ")} …</span>
            </>
          )}
          <LinkButton className="ml-auto flex shrink-0 items-center gap-1 text-sm whitespace-nowrap" onClick={() => actions.setAddingProvider(true)}><Icon name="plus" size={12} />Add custom provider</LinkButton>
        </div>
      </CardBody>
    </Card>
  );
}

function detail(p: ProviderRow) {
  const how = connection(p);
  if (how) return `${how} · ${plural(p.available, "model")}`;
  return `${plural(p.models, "model")} · ${waysToConnect(p)}`;
}

/** How a provider is connected now, or undefined when it is not. */
function connection(p: ProviderRow): string | undefined {
  if (p.subscription) return "subscription";
  if (p.source === "environment") return "key from the environment";
  if (p.source === "stored") return "api key";
  if (p.custom) return "custom provider";
  if (p.configured) return "configured";
  return undefined;
}

function waysToConnect(p: ProviderRow): string {
  if (p.canLogin && p.canKey) return "subscription or api key";
  return p.canLogin ? "subscription" : "api key";
}
