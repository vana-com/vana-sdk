import "@testing-library/jest-dom/vitest";

// Set up default environment variables for tests
process.env.NEXT_PUBLIC_PERSONAL_SERVER_BASE_URL =
  "https://personal-server.example.com";
process.env.NEXT_PUBLIC_RELAYER_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_SUBGRAPH_URL =
  "http://localhost:8000/subgraphs/name/vana";
