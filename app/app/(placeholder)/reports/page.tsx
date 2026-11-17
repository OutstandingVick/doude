import { FileText } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export default function ReportsPage() {
  return (
    <div>
      <h1 className="mb-5 text-2xl font-semibold text-text">Reports</h1>
      <div className="card">
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Reports are coming soon"
          description="Generated spill reports and PDF export will appear here."
        />
      </div>
    </div>
  );
}