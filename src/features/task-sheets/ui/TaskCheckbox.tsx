import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox";
import { Icon } from "../../../shared/ui/Icon";

export function TaskCheckbox(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <label class="ts-check">
      <Checkbox checked={props.checked} onCheckedChange={(next) => props.onChange(next === true)}>
        <CheckboxIndicator>
          <Icon name="check" size={14} />
        </CheckboxIndicator>
      </Checkbox>
      {props.children}
    </label>
  );
}
