"use client";

import React from "react";
import { useChainId } from "wagmi";
import {
  Card,
  CardHeader,
  CardBody,
  Button,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@heroui/react";
import { FileCode, ExternalLink, Copy } from "lucide-react";
import type { VanaContractName } from "@opendatalabs/vana-sdk/browser";
import { useVana } from "@/providers/VanaProvider";
import { getContractUrl } from "@/lib/explorer";

/**
 * Contracts page - View deployed Vana smart contracts
 *
 * This page provides transparency by listing all deployed Vana protocol
 * smart contracts with their addresses and links to blockchain explorers.
 */
export default function ContractsPage() {
  const chainId = useChainId();
  const { vana } = useVana();

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Smart Contracts
        </h1>
        <p className="text-lg text-default-600">
          {chainId === 14800 ? "Moksha Testnet" : "Vana Mainnet"}
        </p>
      </div>

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Protocol Contracts</h3>
          </div>
        </CardHeader>
        <CardBody>
          {vana ? (
            <Table aria-label="Smart contracts table" removeWrapper>
              <TableHeader>
                <TableColumn>Contract Name</TableColumn>
                <TableColumn>Address</TableColumn>
                <TableColumn>Actions</TableColumn>
              </TableHeader>
              <TableBody>
                {vana.protocol
                  .getAvailableContracts()
                  .filter((contractName: string) => {
                    try {
                      vana.protocol.getContract(
                        contractName as VanaContractName,
                      );
                      return true;
                    } catch {
                      return false;
                    }
                  })
                  .map((contractName: string) => {
                    const contract = vana.protocol.getContract(
                      contractName as VanaContractName,
                    );
                    return (
                      <TableRow key={contractName}>
                        <TableCell>{contractName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">
                              {contract.address}
                            </span>
                            <Button
                              size="sm"
                              variant="flat"
                              isIconOnly
                              onPress={() =>
                                navigator.clipboard.writeText(contract.address)
                              }
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            as="a"
                            href={getContractUrl(chainId, contract.address, {
                              tab: "contract",
                            })}
                            target="_blank"
                            rel="noopener noreferrer"
                            size="sm"
                            variant="flat"
                            startContent={<ExternalLink className="h-3 w-3" />}
                          >
                            View on Explorer
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center p-8">
              <p>Loading Vana SDK...</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
