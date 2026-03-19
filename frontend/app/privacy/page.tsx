import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Fino",
};

export default function PrivacyPolicyPage() {
  const contactEmail = process.env.ADMIN_EMAIL || "privacy@tryfino.com";

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        &larr; Back
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <img src="/logo.png" alt="" className="h-8 w-8" />
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
      </div>
      <p className="mb-10 text-sm text-muted-foreground">Effective March 18, 2026</p>

      <div className="prose prose-sm dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-lg font-semibold">Our Commitment to Your Privacy</h2>
          <p>
            At Fino, we take your privacy seriously. We believe financial data is among the most
            sensitive information a person has, and we treat it accordingly.
          </p>
          <p>
            <strong>We will never sell your financial data.</strong> We do not run ads, we do not
            build advertising profiles, and we do not share your information with data brokers.
            Fino exists to help you manage your money — that is the only way we use your data.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">What This Policy Covers</h2>
          <p>
            This privacy policy applies to the hosted Fino service operated at this domain. It
            describes what personal data we collect, how we use it, who we share it with, and
            your rights regarding that data. By using Fino, you agree to the practices described
            in this policy.
          </p>
          <p>
            Fino is also available as open-source software for self-hosting. If you are running
            your own instance, the operator of that instance is responsible for their own privacy
            practices.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Data We Collect</h2>

          <h3 className="text-base font-medium mt-4">Account Data</h3>
          <p>
            When you sign in with Google, we receive your name, email address, and profile picture.
            This is used to identify you within the application and to communicate with you about
            your account.
          </p>

          <h3 className="text-base font-medium mt-4">Financial Data</h3>
          <p>
            When you connect bank accounts via Plaid, we receive account balances, transaction history,
            and account metadata (name, type, institution) from your financial institutions. We use
            this data to provide you with a consolidated view of your finances, generate reports,
            track budgets, and categorize your transactions.
          </p>
          <p>
            If you manually create accounts or import transactions via CSV, we store that data in the
            same manner.
          </p>
          <p>
            <strong>We never receive or store your bank login credentials.</strong> Plaid handles
            authentication with your financial institution directly through its secure infrastructure.
          </p>

          <h3 className="text-base font-medium mt-4">Usage Data</h3>
          <p>
            We record basic activity logs (login timestamps, sync events, categorization actions)
            to maintain the service and provide administrative analytics. We do not use third-party
            analytics or tracking tools within the application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">How We Use Your Data</h2>
          <p>We use the data we collect for the following purposes:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Providing the service</strong> — displaying your accounts, transactions, budgets, goals, net worth, and reports</li>
            <li><strong>Transaction categorization</strong> — applying rules and AI to categorize your spending</li>
            <li><strong>Syncing</strong> — keeping your account balances and transactions up to date via Plaid</li>
            <li><strong>Household features</strong> — enabling shared views between household members you invite</li>
            <li><strong>Service maintenance</strong> — monitoring for errors, preventing abuse, and improving reliability</li>
          </ul>
          <p className="mt-2">
            We do not use your data for advertising, marketing to third parties, building consumer
            profiles, or any purpose unrelated to providing you with the Fino service.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Third-Party Services</h2>
          <p>
            We integrate with the following third-party services to provide Fino. Each operates
            under its own privacy policy. We only share the minimum data necessary for each
            service to function.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2 pr-4 text-left font-medium">Service</th>
                  <th className="py-2 pr-4 text-left font-medium">Purpose</th>
                  <th className="py-2 text-left font-medium">Data Shared</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                <tr>
                  <td className="py-2 pr-4"><a href="https://plaid.com/legal/" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Plaid</a></td>
                  <td className="py-2 pr-4">Bank account linking &amp; transaction sync</td>
                  <td className="py-2">Bank credentials are handled entirely by Plaid. We receive account balances, transactions, and account metadata.</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><a href="https://policies.google.com/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Google</a></td>
                  <td className="py-2 pr-4">Authentication (OAuth 2.0)</td>
                  <td className="py-2">Name, email address, profile picture</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><a href="https://openai.com/privacy/" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">OpenAI</a> (or configured LLM provider)</td>
                  <td className="py-2 pr-4">AI transaction categorization</td>
                  <td className="py-2">Merchant names and transaction amounts only — no account numbers, balances, or personally identifiable information</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4"><a href="https://railway.com/legal/privacy" className="underline hover:text-foreground" target="_blank" rel="noopener noreferrer">Railway</a></td>
                  <td className="py-2 pr-4">Infrastructure hosting</td>
                  <td className="py-2">All application data is stored on Railway&apos;s infrastructure (servers located in the United States)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-3">
            We do not share your financial data with any other third parties. We do not use
            advertising networks, data brokers, or analytics services that track you across sites.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">How Your Data Is Protected</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>All sensitive credentials (Plaid access tokens, API keys) are <strong>encrypted at rest</strong> using AES encryption before being stored in the database</li>
            <li>All connections use <strong>HTTPS/TLS</strong> encryption in transit</li>
            <li>Authentication uses <strong>secure, HTTP-only cookies</strong> that are not accessible to JavaScript</li>
            <li>API endpoints are <strong>rate-limited</strong> to prevent abuse</li>
            <li>Every request is <strong>authenticated</strong> — there are no public data endpoints</li>
            <li>Household data is <strong>scoped by membership</strong> so users only see what they are authorized to access</li>
            <li>Admin accounts cannot be demoted, disabled, or deleted to prevent lockout attacks</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Data Storage &amp; Retention</h2>
          <p>
            Your data is stored in a PostgreSQL database hosted on Railway&apos;s infrastructure
            in the United States. We retain your data for as long as your account is active.
          </p>
          <p>
            You may <strong>delete your account</strong> at any time from the Settings page. Account
            deletion permanently removes all of your personal data from our database, including your
            profile, transactions, accounts, budgets, goals, category rules, and all associated records.
            This action is irreversible.
          </p>
          <p>
            When you disconnect a bank account, we revoke the Plaid access token so no further data
            is retrieved from that institution.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Cookies</h2>
          <p>
            Fino uses a single <strong>essential cookie</strong> (<code>session</code>) to maintain
            your authenticated session. This cookie is HTTP-only (not accessible to JavaScript),
            uses the <code>SameSite=Lax</code> attribute, and is marked as <code>Secure</code> in
            production.
          </p>
          <p>
            We do not use tracking cookies, advertising cookies, retargeting pixels, or any
            third-party analytics cookies. We do not respond to &ldquo;Do Not Track&rdquo; browser
            signals because we do not track you in the first place.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Household Sharing</h2>
          <p>
            Fino supports household sharing, where you can invite a partner to view and manage
            finances together. If you create or join a household:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your household partner can see your accounts, transactions, budgets, and goals in &ldquo;Household&rdquo; and &ldquo;Partner&rdquo; view modes</li>
            <li>You can see your partner&apos;s data in the same way</li>
            <li>Each member controls their own data — your partner cannot delete your accounts or modify your personal transactions</li>
            <li>You can leave a household at any time from Settings</li>
          </ul>
          <p className="mt-2">
            By inviting a partner, you consent to sharing your financial data with that person
            through the application.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">AI Categorization</h2>
          <p>
            Fino uses AI (via OpenAI or a configured LLM provider) to automatically categorize
            transactions. When AI categorization runs, we send <strong>only merchant names and
            transaction amounts</strong> to the LLM provider. We do not send:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your name, email, or any personal identifiers</li>
            <li>Account numbers or balances</li>
            <li>Bank or institution names</li>
            <li>Transaction dates or any other metadata</li>
          </ul>
          <p className="mt-2">
            You can also categorize transactions manually or with keyword rules, bypassing AI entirely.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Children&apos;s Privacy</h2>
          <p>
            Fino is not directed to children under the age of 13, and we do not knowingly collect
            personal information from children under 13. If you believe a child has created an
            account, please contact us to have it removed.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Your Rights</h2>
          <p>You have the following rights regarding your data on Fino:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Access</strong> — view all data associated with your account at any time through the application</li>
            <li><strong>Correction</strong> — edit your profile, transactions, accounts, and other records</li>
            <li><strong>Deletion</strong> — permanently delete your account and all associated data from Settings</li>
            <li><strong>Portability</strong> — export your transaction data</li>
            <li><strong>Revocation</strong> — disconnect bank accounts and revoke Plaid access at any time from the Connections page</li>
            <li><strong>Withdraw consent</strong> — stop using the service and delete your account at any time; no penalties or fees apply</li>
          </ul>
          <p className="mt-2">
            To exercise any of these rights, you can use the features available within the
            application or contact us at the address below.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Changes to This Policy</h2>
          <p>
            We may update this privacy policy from time to time. When we make material changes,
            we will update the effective date at the top of this page. Your continued use of Fino
            after changes are posted constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Contact</h2>
          <p>
            If you have questions about this privacy policy, your data, or wish to exercise
            your rights, please reach out to us at:
          </p>
          <p className="mt-2">
            <a href={`mailto:${contactEmail}`} className="underline hover:text-foreground">{contactEmail}</a>
          </p>
        </section>
      </div>

      <div className="mt-16 border-t border-border/50 pt-6">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <img src="/logo.png" alt="" className="h-4 w-4" />
          <span className="gradient-text-warm font-semibold">fino</span>
          &mdash; Personal finance, simplified
        </p>
      </div>
    </div>
  );
}
