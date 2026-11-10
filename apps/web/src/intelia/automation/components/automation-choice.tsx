import { Fieldset, FieldsetLegend } from "@/components/ui/fieldset";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";

// The Fieldset's class wins over the rendered RadioGroup's, so the row
// layout of the options goes here.
const FIELDSET_CLASS = "max-w-none flex-row flex-wrap gap-x-4 gap-y-1.5";

// One required radio group named by its legend, with nothing preselected
// while `value` is null.
export function AutomationChoice<Value extends string>({
  legend,
  options,
  value,
  onChange,
  disabled,
}: {
  legend: string;
  options: readonly { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
  disabled?: boolean;
}) {
  return (
    <Fieldset
      className={FIELDSET_CLASS}
      render={
        <RadioGroup
          disabled={disabled}
          value={value}
          onValueChange={(selected) => {
            const option = options.find(
              (candidate) => candidate.value === selected,
            );
            if (option) onChange(option.value);
          }}
        />
      }
    >
      <FieldsetLegend className="w-full font-medium text-xs">
        {legend}
      </FieldsetLegend>
      {options.map((option) => (
        <Label
          key={option.value}
          className="items-center gap-2 font-normal text-sm"
        >
          <Radio value={option.value} />
          {option.label}
        </Label>
      ))}
    </Fieldset>
  );
}
