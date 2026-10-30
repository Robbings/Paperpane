import { Select, type SelectOption } from "@/ui/components";

/** Standalone model forms need a visible label as well as the Select's accessible name. */
export function ModelSelect<T extends string>(props: {
  label: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="pp-model-labeled-select">
      <span>{props.label}</span>
      <Select {...props} block />
    </div>
  );
}
