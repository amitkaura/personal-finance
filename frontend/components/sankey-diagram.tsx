"use client";

import { useQuery } from "@tanstack/react-query";
import { ResponsiveSankey } from "@nivo/sankey";
import { api } from "@/lib/api";
import { useScope } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";
import type { Account } from "@/lib/types";

interface SankeyNode {
  id: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

const INCOME_KEYWORDS = ["payroll", "salary", "direct dep", "factset", "income", "deposit"];

function isIncome(txn: Transaction): boolean {
  if (txn.amount < 0) return true; // Plaid: negative = money in
  const name = (txn.merchant_name || "").toLowerCase();
  return INCOME_KEYWORDS.some((kw) => name.includes(kw));
}

function buildSankeyData(
  transactions: Transaction[],
  accounts: Account[]
) {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));

  const incomeBySource = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();
  const incomeToAccount = new Map<string, Map<string, number>>();
  const accountToExpense = new Map<string, Map<string, number>>();

  for (const txn of transactions) {
    const accountName = accountMap.get(txn.account_id ?? 0) || "Other";

    if (isIncome(txn)) {
      const source = txn.merchant_name || "Other Income";
      const amount = Math.abs(txn.amount);
      incomeBySource.set(source, (incomeBySource.get(source) || 0) + amount);

      if (!incomeToAccount.has(source)) incomeToAccount.set(source, new Map());
      const accMap = incomeToAccount.get(source)!;
      accMap.set(accountName, (accMap.get(accountName) || 0) + amount);
    } else {
      const category = txn.category || "Uncategorized";
      const amount = Math.abs(txn.amount);
      expenseByCategory.set(
        category,
        (expenseByCategory.get(category) || 0) + amount
      );

      if (!accountToExpense.has(accountName))
        accountToExpense.set(accountName, new Map());
      const catMap = accountToExpense.get(accountName)!;
      catMap.set(category, (catMap.get(category) || 0) + amount);
    }
  }

  const nodeIds = new Set<string>();
  const links: SankeyLink[] = [];

  for (const [source, accMap] of incomeToAccount) {
    const srcId = `inc_${source}`;
    nodeIds.add(srcId);
    for (const [acc, val] of accMap) {
      const accId = `acc_${acc}`;
      nodeIds.add(accId);
      links.push({ source: srcId, target: accId, value: Math.round(val) || 1 });
    }
  }

  for (const [acc, catMap] of accountToExpense) {
    const accId = `acc_${acc}`;
    nodeIds.add(accId);
    for (const [cat, val] of catMap) {
      const catId = `exp_${cat}`;
      nodeIds.add(catId);
      links.push({ source: accId, target: catId, value: Math.round(val) || 1 });
    }
  }

  const nodes: SankeyNode[] = Array.from(nodeIds).map((id) => ({ id }));

  return { nodes, links };
}

function labelFromId(id: string): string {
  return id.replace(/^(inc_|acc_|exp_)/, "");
}

export default function SankeyDiagram() {
  const scope = useScope();
  const queryLimit = 200;
  const { data: transactions, isLoading: txnLoading } = useQuery({
    queryKey: ["transactions", "all", scope, queryLimit],
    queryFn: () => api.getTransactions({ limit: queryLimit, scope }),
  });

  const { data: accounts, isLoading: acctLoading } = useQuery({
    queryKey: ["accounts", scope],
    queryFn: () => api.getAccounts(scope),
  });

  if (txnLoading || acctLoading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-border bg-card">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-accent" />
      </div>
    );
  }

  if (!transactions?.length || !accounts?.length) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          Not enough data to render cash flow. Sync your accounts first.
        </p>
      </div>
    );
  }

  const data = buildSankeyData(transactions, accounts);

  if (data.nodes.length < 2 || data.links.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center rounded-2xl border border-border bg-card">
        <p className="text-sm text-muted-foreground">
          Not enough data to render cash flow.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[500px] rounded-2xl border border-border bg-card p-4">
      <ResponsiveSankey
        data={data}
        margin={{ top: 20, right: 160, bottom: 20, left: 160 }}
        align="justify"
        colors={{ scheme: "purple_orange" }}
        nodeOpacity={1}
        nodeThickness={16}
        nodeInnerPadding={3}
        nodeSpacing={20}
        nodeBorderWidth={0}
        nodeBorderRadius={3}
        linkOpacity={0.3}
        linkHoverOpacity={0.6}
        linkContract={3}
        enableLinkGradient
        labelPosition="outside"
        labelOrientation="horizontal"
        labelPadding={12}
        labelTextColor="#a1a1aa"
        label={(node) => labelFromId(node.id as string)}
        theme={{
          text: { fill: "#a1a1aa", fontSize: 11 },
          tooltip: {
            container: {
              background: "#18181b",
              color: "#fafafa",
              borderRadius: "8px",
              border: "1px solid #27272a",
              fontSize: "12px",
            },
          },
        }}
      />
    </div>
  );
}
