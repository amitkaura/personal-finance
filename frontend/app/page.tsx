import dynamic from "next/dynamic";
import SyncButton from "@/components/sync-button";

const skeleton = () => (
  <div className="rounded-2xl border border-border bg-card p-6 animate-pulse h-32" />
);

const NetWorthCard = dynamic(() => import("@/components/net-worth-card"), {
  loading: skeleton,
});
const NetWorthHistory = dynamic(() => import("@/components/net-worth-history"), {
  loading: skeleton,
});
const RecurringWidget = dynamic(() => import("@/components/recurring-widget"), {
  loading: skeleton,
});
const TopMovers = dynamic(() => import("@/components/top-movers"), {
  loading: skeleton,
});
const CreditCardsWidget = dynamic(() => import("@/components/credit-cards-widget"), {
  loading: skeleton,
});
const LoansWidget = dynamic(() => import("@/components/loans-widget"), {
  loading: skeleton,
});
const ReviewSnippet = dynamic(() => import("@/components/review-snippet"), {
  loading: skeleton,
});
const BudgetSnippet = dynamic(() => import("@/components/budget-snippet"), {
  loading: skeleton,
});
const GoalsSnippet = dynamic(() => import("@/components/goals-snippet"), {
  loading: skeleton,
});

export default function DashboardPage() {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Your financial overview at a glance.
          </p>
        </div>
        <SyncButton />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 [&>div]:h-full">
          <NetWorthCard />
        </div>
        <TopMovers />
      </div>

      <div className="mt-6">
        <NetWorthHistory />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BudgetSnippet />
        <GoalsSnippet />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CreditCardsWidget />
        <LoansWidget />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <RecurringWidget />
        <ReviewSnippet />
      </div>
    </>
  );
}
