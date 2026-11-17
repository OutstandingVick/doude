import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function CompliancePage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-text">Compliance</h1>
      <div className="card">
        <EmptyState
          icon={<ShieldCheck className="h-6 w-6" />}
          title="Compliance is coming soon"
          description="Regulatory tracking for EGASPIN and NOSDRA will appear here."
        />
      </div>
    </div>
  );
}