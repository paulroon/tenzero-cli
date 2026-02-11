import type { TzConfig } from "@/lib/config";
import { useBackKey } from "@/hooks/useBackKey";
import NotYetImplemented from "@/ui/components/NotYetImplemented";

type Props = {
  config: TzConfig;
  onBack: () => void;
  projectDirectory: string;
};

export default function NextJsHandler({ onBack }: Props) {
  useBackKey(onBack);
  return <NotYetImplemented message="Not yet implemented" />;
}
