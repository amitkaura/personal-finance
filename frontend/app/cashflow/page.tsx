import SankeyDiagram from "@/components/sankey-diagram";
import CashFlowBarChart from "@/components/cashflow-bar-chart";

export default function CashFlowPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Cash Flow</h1>
      <p className="text-sm text-muted-foreground">
        Income sources flowing through accounts into expense categories.
      </p>
      <div className="mt-8">
        <CashFlowBarChart />
      </div>
      <div className="mt-6">
        <SankeyDiagram />
      </div>
    </>
  );
}
