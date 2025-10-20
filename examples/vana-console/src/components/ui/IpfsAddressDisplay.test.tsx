import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../tests/test-utils";
import { IpfsAddressDisplay } from "./IpfsAddressDisplay";

describe("IpfsAddressDisplay", () => {
  it("should render IPFS URL with default label", () => {
    renderWithProviders(<IpfsAddressDisplay ipfsUrl="ipfs://QmTestHash123" />);

    expect(screen.getByText("IPFS URL:")).toBeInTheDocument();
    // By default, URLs are truncated
    expect(screen.getByText("ipfs:/...h123")).toBeInTheDocument();
  });

  it("should render with custom label", () => {
    renderWithProviders(
      <IpfsAddressDisplay ipfsUrl="ipfs://QmTestHash123" label="Custom IPFS" />,
    );

    expect(screen.getByText("Custom IPFS:")).toBeInTheDocument();
  });

  it("should handle non-truncated display", () => {
    renderWithProviders(
      <IpfsAddressDisplay
        ipfsUrl="ipfs://QmTestHash123456789"
        truncate={false}
      />,
    );

    expect(screen.getByText("ipfs://QmTestHash123456789")).toBeInTheDocument();
  });
});
