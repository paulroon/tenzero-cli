import { Box, Text } from "ink";
import { Alert, Select, Spinner } from "@inkjs/ui";

type OptionItem = { label: string; value: string };

export function OptionStatusPanel(props: {
  title: string;
  variant: "success" | "error" | "warning" | "info";
  alertTitle: string;
  message: string;
  options?: OptionItem[];
  onSelect?: (value: string) => void;
}) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{props.title}</Text>
      <Alert variant={props.variant} title={props.alertTitle}>
        {props.message}
      </Alert>
      {props.options && props.onSelect && (
        <Select options={props.options} onChange={props.onSelect} />
      )}
    </Box>
  );
}

export function OptionLoadingPanel(props: { title: string; spinnerLabel: string; note?: string }) {
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="yellow">{props.title}</Text>
      <Spinner label={props.spinnerLabel} />
      {props.note && <Text dimColor>{props.note}</Text>}
    </Box>
  );
}
