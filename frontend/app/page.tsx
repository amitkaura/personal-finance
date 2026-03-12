import NetWorthCard from "@/components/net-worth-card";
import RecurringWidget from "@/components/recurring-widget";
import TopMovers from "@/components/top-movers";
import CreditCardsWidget from "@/components/credit-cards-widget";
import LoansWidget from "@/components/loans-widget";
import SyncButton from "@/components/sync-button";
import ReviewSnippet from "@/components/review-snippet";

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
        <div className="lg:col-span-2">
          <NetWorthCard />
        </div>
        <TopMovers />
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
