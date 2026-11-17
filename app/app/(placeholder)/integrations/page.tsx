import { Plug } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function IntegrationsPage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-text">Integrations</h1>
      <div className="card">
        <EmptyState
          icon={<Plug className="h-6 w-6" />}
          title="Integrations are coming soon"
          description="Connect NOSDRA, NUPRC and operator systems here."
        />
      </div>
    </div>
  );
}