import { ethers } from "ethers";
import { getContractController } from "../core/contractsController";
import { VanaProvider } from "../core/provider";

export class DataRegistryClient {
  private contract: ReturnType<typeof getContractController<"DataRegistry">>;

  constructor(private readonly provider: VanaProvider) {
    this.contract = getContractController("DataRegistry", provider.client);
  }

  /**
   * Add a file to the registry
   * @param fileUrl URL where the file is stored
   * @param owner Address of the file owner
   * @returns Transaction receipt after 1 confirmation
   */
  async addFile(
    fileUrl: string,
    owner: string
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.addFile(fileUrl, owner);
    return tx.wait(1);
  }

  /**
   * Add a file to the registry and grant a DLP access
   * @param fileUrl URL where the file is stored
   * @param owner Address of the file owner
   * @param dlpAddress Address of the DLP to grant access
   * @param encryptedKey Encrypted decryption key for the file
   * @returns Transaction receipt after 1 confirmation
   */
  async addFileWithPermissions(
    fileUrl: string,
    owner: string,
    dlpAddress: string,
    encryptedKey: string
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.addFileWithPermissions(fileUrl, owner, [
      { account: dlpAddress, key: encryptedKey },
    ]);
    return tx.wait(1);
  }

  /**
   * Fetch the on-chain file ID given its URL
   * @param fileUrl URL of the file
   * @returns File ID as bigint
   */
  async getFileId(fileUrl: string): Promise<bigint> {
    return this.contract.fileIdByUrl(fileUrl);
  }
}
