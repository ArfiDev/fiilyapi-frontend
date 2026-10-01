import { Input } from "@/components/ui";
import { SearchIcon } from "@/components/ui/icons";

interface WorkItemSearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  /** Süzülmüş kalem sayısı (KIK:125). */
  count: number;
}

/** KIK:117-125 — "Poz no ya da tarif ara" + "N kalem". */
export function WorkItemSearchBar({ query, onQueryChange, count }: WorkItemSearchBarProps) {
  return (
    <div className="wik-search">
      <Input
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Poz no ya da tarif ara"
        aria-label="Poz no ya da tarif ara"
        leftIcon={<SearchIcon width={13} height={13} />}
        wrapperClassName="wik-search__box"
      />
      <span className="wik-search__count" data-testid="wik-count">
        <b>{count}</b> kalem
      </span>
    </div>
  );
}
