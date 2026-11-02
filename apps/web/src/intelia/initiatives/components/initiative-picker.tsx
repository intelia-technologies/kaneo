import { useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/cn";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";
import { useCreateInitiative, useInitiativeOptions } from "../api";
import "../i18n";

export function normalizeInitiativeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export type PickerOption = {
  id: string;
  name: string;
  planClosedAt: string | null;
  isCreate?: boolean;
};

const CREATE_OPTION_ID = "__create_new__";

export function InitiativePicker({
  projectId,
  value,
  onChange,
  disabled = false,
  invalid = false,
  id,
  className,
}: {
  projectId: string | undefined;
  value: string | null;
  onChange: (initiativeId: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const autoId = useId();
  const triggerId = id ?? autoId;
  const listId = `${triggerId}-options`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const { data: options = [], isLoading } = useInitiativeOptions(projectId);
  const createInitiative = useCreateInitiative();

  const isDisabled = disabled || !projectId;
  const selectedOption = options.find((opt) => opt.id === value);

  const queryKey = normalizeInitiativeName(query);
  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    if (!queryKey) return options;
    return options.filter((opt) =>
      normalizeInitiativeName(opt.name).includes(queryKey),
    );
  }, [options, queryKey]);

  const hasExactMatch = useMemo(() => {
    if (!queryKey) return false;
    return options.some(
      (opt) => normalizeInitiativeName(opt.name) === queryKey,
    );
  }, [options, queryKey]);

  const showCreateOption = trimmedQuery.length > 0 && !hasExactMatch;

  const items: PickerOption[] = useMemo(() => {
    const list: PickerOption[] = filtered.map((opt) => ({
      id: opt.id,
      name: opt.name,
      planClosedAt: opt.planClosedAt,
    }));
    if (showCreateOption) {
      list.push({
        id: CREATE_OPTION_ID,
        name: trimmedQuery,
        planClosedAt: null,
        isCreate: true,
      });
    }
    return list;
  }, [filtered, showCreateOption, trimmedQuery]);

  const handleSelect = (initiativeId: string) => {
    onChange(initiativeId);
    setOpen(false);
    setQuery("");
    setCreateError(null);
  };

  const handleCreate = async (name: string) => {
    if (!projectId || !name || createInitiative.isPending) return;
    try {
      setCreateError(null);
      const created = await createInitiative.mutateAsync({
        projectId,
        name,
      });
      onChange(created.id);
      setOpen(false);
      setQuery("");
    } catch (err: unknown) {
      let message = t("intelia:initiative.createError");
      if (
        err instanceof HttpError &&
        (err.status === 409 || err.code === "INITIATIVE_NAME_TAKEN")
      ) {
        message = t("intelia:initiative.nameTaken");
      } else if (err instanceof Error && err.message) {
        message = err.message;
      }
      setCreateError(message);
      toast.error(message);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery("");
          setCreateError(null);
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-haspopup="listbox"
          aria-invalid={invalid ? true : undefined}
          aria-label={t("intelia:initiative.title")}
          disabled={isDisabled}
          className={cn(
            "relative inline-flex min-h-9 w-full min-w-36 cursor-pointer select-none items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 text-left text-sm text-foreground shadow-xs outline-none transition-colors",
            "hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:pointer-events-none disabled:opacity-50",
            invalid &&
              "border-destructive text-destructive focus-visible:border-destructive focus-visible:ring-destructive",
            className,
          )}
        >
          <span
            className={cn(
              "truncate flex-1",
              !selectedOption && "text-muted-foreground",
            )}
          >
            {selectedOption
              ? selectedOption.name
              : t("intelia:initiative.placeholder")}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[calc(var(--anchor-width,18rem))] min-w-56 p-0"
      >
        <Command items={items} filter={null}>
          <CommandInput
            placeholder={t("intelia:initiative.searchPlaceholder")}
            aria-label={t("intelia:initiative.searchPlaceholder")}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCreateError(null);
            }}
          />
          {createError && (
            <p
              role="alert"
              className="px-2 py-1 text-destructive text-xs font-medium"
            >
              {createError}
            </p>
          )}
          <CommandPanel>
            <CommandEmpty>
              {isLoading
                ? t("common:loading")
                : t("intelia:initiative.noMatches")}
            </CommandEmpty>
            <CommandList id={listId}>
              {(item: PickerOption) => {
                if (item.isCreate) {
                  return (
                    <CommandItem
                      key={item.id}
                      value={item.id}
                      onClick={() => void handleCreate(item.name)}
                      className="text-primary font-medium hover:bg-primary/10"
                    >
                      <Plus className="size-4 shrink-0" />
                      <span className="truncate">
                        {t("intelia:initiative.createOption", {
                          name: item.name,
                        })}
                      </span>
                    </CommandItem>
                  );
                }
                return (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      item.id === value &&
                        "bg-accent/50 font-medium text-accent-foreground",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 w-full">
                      <span className="truncate flex-1">{item.name}</span>
                      {item.planClosedAt !== null && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {t("intelia:initiative.planClosedBadge")}
                        </span>
                      )}
                      {item.id === value && (
                        <Check className="size-4 shrink-0 ml-1 text-foreground" />
                      )}
                    </div>
                  </CommandItem>
                );
              }}
            </CommandList>
          </CommandPanel>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
