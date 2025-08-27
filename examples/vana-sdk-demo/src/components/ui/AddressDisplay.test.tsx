import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../tests/test-utils";
import { AddressDisplay } from "./AddressDisplay";

describe("AddressDisplay", () => {
  it("renders address with truncation", () => {
    const address = "0x1234567890123456789012345678901234567890";
    renderWithProviders(<AddressDisplay address={address} />);

    expect(screen.getByText("0x1234...7890")).toBeInTheDocument();
  });

  it("renders full address when truncate is false", () => {
    const address = "0x1234567890123456789012345678901234567890";
    renderWithProviders(<AddressDisplay address={address} truncate={false} />);

    expect(screen.getByText(address)).toBeInTheDocument();
  });

  it("renders with label", () => {
    const address = "0x1234567890123456789012345678901234567890";
    renderWithProviders(<AddressDisplay address={address} label="Owner" />);

    expect(screen.getByText("Owner:")).toBeInTheDocument();
  });
});
