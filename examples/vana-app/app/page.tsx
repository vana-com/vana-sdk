import { ConnectSpotifyButton } from "./components/ConnectSpotifyButton";
import { getExampleAppInfo } from "@/lib/vana";

export default function Home() {
  const info = getExampleAppInfo();

  return (
    <main className="app-shell">
      <ConnectSpotifyButton />

      <aside className="config-panel" aria-label="App configuration">
        <h2>Backend configuration</h2>
        <dl>
          <div>
            <dt>Mode</dt>
            <dd>{info.mode}</dd>
          </div>
          <div>
            <dt>Network</dt>
            <dd>{info.network}</dd>
          </div>
          <div>
            <dt>App address</dt>
            <dd>{info.appAddress}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{info.source}</dd>
          </div>
          <div>
            <dt>Scopes</dt>
            <dd>{info.scopes.join(", ")}</dd>
          </div>
          {info.mode === "sample" && (
            <div>
              <dt>Sample data</dt>
              <dd>{info.sampleDataUrl}</dd>
            </div>
          )}
        </dl>
      </aside>
    </main>
  );
}
