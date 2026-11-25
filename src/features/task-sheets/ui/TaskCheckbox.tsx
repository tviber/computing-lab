import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox";
import { Icon } from "../../../shared/ui/Icon";

export function TaskCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <label className="ts-check">
      <Checkbox checked={checked} onCheckedChange={(next) => onChange(next === true)}>
        <CheckboxIndicator>
          <Icon name="check" size={14} />
        </CheckboxIndicator>
      </Checkbox>
      {children}
    </label>
  );
}
