import { Plug } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";

export default function IntegrationsPage() {
  return (
    <div>
      <Topbar title="Integrations" breadcrumb={[{ label: "Integrations" }]} />
      <EmptyState
        icon={<Plug className="h-6 w-6" />}
        title="Integrations are coming soon"
        description="Connect NOSDRA, NUPRC and operator systems here."
      />
    </div>
  );
}