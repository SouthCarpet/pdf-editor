// Delta U: reusable Unlock options panel - shared between UnlockTool and
// the pipeline NodeConfigPanel.
import { Input } from "@/components/ui/input";
import { TextField } from "./fields";

export interface UnlockOptionsValue {
  password: string;
}

// eslint-disable-next-line react-refresh/only-export-components
export const DEFAULT_UNLOCK_OPTIONS: UnlockOptionsValue = {
  password: "",
};

interface Props {
  value: UnlockOptionsValue;
  onChange: (next: UnlockOptionsValue) => void;
  mode?: "standalone" | "pipeline-node";
}

export function UnlockOptions({ value, onChange }: Props) {
  return (
    <TextField label="Password">
      <Input
        type="password"
        value={value.password}
        onChange={(e) => onChange({ password: e.target.value })}
        placeholder="(empty to detect / try unencrypted)"
      />
    </TextField>
  );
}
