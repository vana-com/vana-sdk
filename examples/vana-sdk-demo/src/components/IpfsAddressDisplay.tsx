import { AddressDisplay } from "./AddressDisplay";
import { getIpfsGatewayUrl } from "@/lib/utils";

interface IpfsAddressDisplayProps {
  ipfsUrl: string;
  label?: string;
  showCopy?: boolean;
  showExternalLink?: boolean;
  truncate?: boolean;
  className?: string;
}

export function IpfsAddressDisplay({
  ipfsUrl,
  label = "IPFS URL",
  showCopy = true,
  showExternalLink = true,
  truncate = true,
  className = "",
}: IpfsAddressDisplayProps) {
  return (
    <AddressDisplay
      address={ipfsUrl}
      label={label}
      explorerUrl={getIpfsGatewayUrl(ipfsUrl)}
      showCopy={showCopy}
      showExternalLink={showExternalLink}
      truncate={truncate}
      className={className}
    />
  );
}
