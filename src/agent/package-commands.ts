import type { ProgressEvent } from "@earendil-works/pi-coding-agent";
import { packageGrant } from "#core/grants";
import { runImport, scanImport } from "#core/import";
import { changePackage, listPackages, searchGallery } from "#core/packages";
import { assertProject } from "#core/projects";
import { listSessions } from "#core/sessions/list";
import { trustList } from "#core/trust";
import { CODE_ITEMS, type ImportItem, type PackageList, type Project } from "#protocol";
import type { Deps, Handlers } from "./handlers";

async function packagesWithTrust(projects: Project[]): Promise<PackageList> {
  return { ...(await listPackages(projects)), trust: trustList(projects) };
}

export function packageCommands({ send, grants, modelRuntime, sessions }: Deps) {
  const sendPackageProgress = (e: ProgressEvent) => send({ type: "package.progress", source: e.source, action: e.action, phase: e.type, message: e.message });

  return {
    "import.scan": () => scanImport(),
    "import.run": async (cmd) => {
      const items = cmd.items.filter((i): i is ImportItem => ["settings", "providers", "trust", "files", "packages"].includes(i));
      // Copying extensions or installing packages brings code into Tenon: only after main's own confirmation.
      const code = CODE_ITEMS.filter((i) => items.includes(i));
      if (code.length) await grants.consumePackageGrant(packageGrant("import", code.join(",")));
      await runImport(items, { onPackage: sendPackageProgress, onResult: (result) => send({ type: "import.result", result }) });
      await modelRuntime.refresh(); // imported providers and keys show at once
    },
    "packages.list": async () => packagesWithTrust((await listSessions()).projects),
    "packages.change": async (cmd) => {
      if (cmd.cwd) await assertProject(cmd.cwd);
      // Installing or updating runs new code (an update can install a missing package or a newer, unreviewed version):
      // only after the user confirmed it in main's own dialog. Removing needs no confirmation.
      if (cmd.action !== "remove") await grants.consumePackageGrant(packageGrant(cmd.action, cmd.source, cmd.cwd));
      const { projects } = await listSessions();
      await changePackage(cmd.action, cmd.source, cmd.cwd, sendPackageProgress, projects[0]?.cwd ?? process.cwd());
    },
    "packages.gallery": (cmd) => searchGallery(cmd.query),
    "packages.reload": () => sessions.reloadAll(),
  } satisfies Partial<Handlers>;
}
