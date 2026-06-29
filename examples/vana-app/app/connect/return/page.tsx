export default async function ConnectReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestId = params.requestId;
  const displayRequestId = Array.isArray(requestId) ? requestId[0] : requestId;

  return (
    <main className="return-page">
      <section className="return-panel">
        <p className="eyebrow">Approval complete</p>
        <h1>You can close this tab.</h1>
        <p>
          The app tab is polling the backend and will read the approved data
          once the request is ready.
        </p>
        {displayRequestId && (
          <p className="request-id">Request: {displayRequestId}</p>
        )}
      </section>
    </main>
  );
}
