import { useEffect, useState } from "react";
import type { GalleryItem } from "#protocol";
import { actions } from "#renderer/actions";
import { Chip, Pill, type PillTone, Spinner } from "#renderer/ui/base";
import { SearchInput } from "#renderer/ui/Field";
import { Icon } from "#renderer/ui/Icon";
import { Card, CardBody, CardHeader } from "#renderer/ui/surfaces";

const galleryTones: Record<GalleryItem["kind"], PillTone> = { skills: "violet", extension: "orange", theme: "accent", prompts: "ok" };
/** Wait for a pause in typing before the npm search: each search is a request to the registry. */
const GALLERY_DEBOUNCE_MS = 250;

/** Board 4, right: packages on npm with the pi-package keyword. A pick goes to the install field. */
export function GalleryPanel({ onPick }: { onPick: (source: string) => void }) {
  const [gallery, setGallery] = useState<GalleryItem[]>();
  const [galleryError, setGalleryError] = useState<string>();
  const [galleryQuery, setGalleryQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      setGalleryError(undefined);
      actions.searchGallery(galleryQuery).then(setGallery, (e: Error) => {
        setGallery([]);
        setGalleryError(e.message);
      });
    }, GALLERY_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [galleryQuery]);

  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>Gallery<span className="ml-auto text-xs font-normal text-muted">npm · pi-package</span></CardHeader>
      <CardBody className="flex min-h-0 flex-1 flex-col gap-3">
        <SearchInput icon={<Icon name="search" />} aria-label="Search the gallery" placeholder="Search the gallery" value={galleryQuery} onChange={(e) => setGalleryQuery(e.target.value)} />
        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto [&>*]:shrink-0">
          {!gallery && <span className="flex items-center gap-2 text-sm text-muted"><Spinner size={11} />Searching npm…</span>}
          {galleryError && <span className="text-sm text-danger">{galleryError}</span>}
          {gallery?.length === 0 && !galleryError && <span className="text-sm text-muted">Nothing found</span>}
          {gallery?.map((g) => (
            <button
              key={g.name}
              className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-hover"
              title="Put it in the install box"
              onClick={() => onPick(`npm:${g.name}`)}
            >
              <span className="flex min-w-0 items-center gap-2">
                <b className="truncate font-semibold">{g.name}</b>
                <Pill tone={galleryTones[g.kind]} className="h-5 text-label">{g.kind}</Pill>
              </span>
              <span className="line-clamp-2 text-xs text-muted">{g.description}</span>
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">Packages on npm with the <Chip>pi-package</Chip> keyword.</span>
      </CardBody>
    </Card>
  );
}
