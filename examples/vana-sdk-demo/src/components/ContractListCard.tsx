import React from "react";
import { Card, CardHeader, CardBody } from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { SectionHeader } from "./ui/SectionHeader";
import { ResourceList } from "./ui/ResourceList";
import { ContractListItem } from "./ContractListItem";
import { EmptyState } from "./ui/EmptyState";

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
    <Card>
      <CardHeader>
        <SectionHeader
          icon={<ExternalLink className="h-5 w-5" />}
          title="Canonical Contracts"
          description={
            <>
              <em>
                Reference: `protocol.getAvailableContracts()`, blockchain
                explorer links
              </em>
              <br />
              All {contracts.length} Vana protocol contracts deployed on{" "}
              {chainName || "this network"}. Click to view on block explorer.
            </>
          }
        />
      </CardHeader>
      <CardBody>
        <ResourceList
          title=""
          description=""
          items={contracts}
          isLoading={false}
          onRefresh={() => {}}
          itemsPerPage={8}
          renderItem={(contractName) => {
            try {
              const contract = getContract(contractName);
              return (
                <ContractListItem
                  key={contractName}
                  contractName={contractName}
                  contractAddress={contract.address}
                  chainId={chainId}
                  isDeployed={true}
                />
              );
            } catch {
              return (
                <ContractListItem
                  key={contractName}
                  contractName={contractName}
                  chainId={chainId}
                  isDeployed={false}
                />
              );
            }
          }}
          emptyState={<EmptyState title="No contracts found" />}
        />
      </CardBody>
    </Card>
  );
};
