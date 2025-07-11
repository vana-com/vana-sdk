import React from "react";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
} from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { EmptyState } from "./ui/EmptyState";
import { getAddressUrl } from "@/lib/explorer";
import { CopyButton } from "./ui/CopyButton";

interface ContractListCardProps {
  contracts: string[];
  getContract: (contractName: unknown) => { address: string };
  chainId: number;
  chainName: string;
}

/**
 * ContractListCard component - Display canonical Vana protocol contracts
 * Reference: protocol.getAvailableContracts(), blockchain explorer links
 */
export const ContractListCard: React.FC<ContractListCardProps> = ({
  contracts,
  getContract,
  chainId,
  chainName,
}) => {
  return (
    <section id="contracts">
      <SectionHeader
        icon={<ExternalLink className="h-5 w-5" />}
        title="Canonical Contracts"
        description={
          <>
            <em>
              Reference: `protocol.getAvailableContracts()`, blockchain explorer
              links
            </em>
            <br />
            All {contracts.length} Vana protocol contracts deployed on{" "}
            {chainName || "this network"}. Click to view on block explorer.
          </>
        }
      />
      <div className="mt-6">
        {contracts.length === 0 ? (
          <EmptyState title="No contracts found" />
        ) : (
          <Table
            aria-label="Canonical contracts table"
            removeWrapper
            classNames={{
              th: "bg-default-100 text-default-700",
              td: "py-4",
            }}
          >
            <TableHeader>
              <TableColumn>Contract Name</TableColumn>
              <TableColumn>Address</TableColumn>
              <TableColumn>Status</TableColumn>
              <TableColumn>Actions</TableColumn>
            </TableHeader>
            <TableBody>
              {contracts.map((contractName) => {
                let contractAddress: string | null = null;
                let isDeployed = false;

                try {
                  const contract = getContract(contractName);
                  contractAddress = contract.address;
                  isDeployed = true;
                } catch {
                  isDeployed = false;
                }

                return (
                  <TableRow key={contractName}>
                    <TableCell>
                      <span className="font-medium">{contractName}</span>
                    </TableCell>
                    <TableCell>
                      {isDeployed && contractAddress ? (
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-small truncate max-w-32">
                            {contractAddress}
                          </span>
                          <CopyButton
                            value={contractAddress}
                            tooltip="Copy contract address"
                          />
                        </div>
                      ) : (
                        <span className="text-default-400">Not deployed</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="sm"
                        color={isDeployed ? "success" : "default"}
                        variant="flat"
                      >
                        {isDeployed ? "Deployed" : "Not Deployed"}
                      </Chip>
                    </TableCell>
                    <TableCell>
                      {isDeployed && contractAddress && (
                        <Button
                          as="a"
                          href={getAddressUrl(chainId, contractAddress)}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                          variant="flat"
                          isIconOnly
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
};
