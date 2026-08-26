export function SetupPage() {
  return (
    <div className="ems-grid flex min-h-svh items-center justify-center px-5">
      <div className="max-w-lg border border-line bg-panel p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-mist">
          Home EMS
        </p>
        <h1 className="mt-2 text-2xl">Connect Convex</h1>
        <p className="mt-3 text-mist">
          Create a <span className="font-mono text-paper">.env.local</span> file
          with your development deployment URL, then restart the Vite server.
        </p>
        <pre className="mt-4 bg-ink p-3 font-mono text-sm">
          VITE_CONVEX_URL=https://YOUR_DEPLOYMENT.convex.cloud
        </pre>
        <p className="mt-4 text-sm text-mist">
          Run <span className="font-mono text-paper">pnpm dev:backend</span>{" "}
          (that is <span className="font-mono">npx convex dev</span>) to create
          the deployment. Do not use convex deploy during development.
        </p>
      </div>
    </div>
  );
}
