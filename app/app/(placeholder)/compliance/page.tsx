import { ShieldCheck } from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { EmptyState } from "@/components/EmptyState";

export default function CompliancePage() {
  return (
    <div>
      <Topbar title="Compliance" breadcrumb={[{ label: "Compliance" }]} />
      <EmptyState
        icon={<ShieldCheck className="h-6 w-6" />}
        title="Compliance is coming soon"
        description="Regulatory tracking for EGASPIN and NOSDRA will appear here."
      />
    </div>
  );
}