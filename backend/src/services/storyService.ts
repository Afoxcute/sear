import { mintNFT } from '../utils/functions/mintNFT';
import { createCommercialRemixTerms, NFTContractAddress, WIP_TOKEN_ADDRESS } from '../utils/utils';
import { publicClient, walletClient, account, networkInfo, BLOCK_EXPLORER_URL } from '../utils/config';
import { uploadJSONToIPFS } from '../utils/functions/uploadToIpfs';
import { createHash } from 'crypto';
import { Address } from 'viem';

// IP Metadata interface for Etherlink
export interface IpMetadata {
    name: string;
    description: string;
    image: string;
    external_url?: string;
    attributes?: Array<{
        trait_type: string;
        value: string | number;
    }>;
    license?: string;
    creator?: string;
    created_at?: string;
}

// ModredIP contract ABI (simplified for IP registration)
const MODRED_IP_ABI = [
    {
        "inputs": [
            {
                "internalType": "string",
                "name": "ipHash",
                "type": "string"
            },
            {
                "internalType": "string",
                "name": "metadata",
                "type": "string"
            },
            {
                "internalType": "bool",
                "name": "isEncrypted",
                "type": "bool"
            }
        ],
        "name": "registerIP",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "tokenId",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "royaltyPercentage",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "duration",
                "type": "uint256"
            },
            {
                "internalType": "bool",
                "name": "commercialUse",
                "type": "bool"
            },
            {
                "internalType": "string",
                "name": "terms",
                "type": "string"
            }
        ],
        "name": "mintLicense",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

export const registerIpWithEtherlink = async (
    ipHash: string,
    metadata: string,
    isEncrypted: boolean,
    modredIpContractAddress: Address
) => {
    try {
        console.log('ipHash:', ipHash);
        console.log('metadata:', metadata);
        console.log('isEncrypted:', isEncrypted);

        // Register IP on ModredIP contract
        const { request } = await publicClient.simulateContract({
            address: modredIpContractAddress,
            abi: MODRED_IP_ABI,
            functionName: 'registerIP',
            args: [
                ipHash,
                metadata,
                isEncrypted
            ],
            account: account.address,
        });

        const hash = await walletClient.writeContract({
            ...request,
            account: account,
  });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        // Extract IP Asset ID from transaction logs
        let ipAssetId: number | undefined;
        if (receipt.logs && receipt.logs.length > 0) {
            // Look for the Transfer event which contains the token ID
            for (const log of receipt.logs) {
                if (log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef') {
                    // Transfer event signature
                    if (log.topics[3]) {
                        ipAssetId = parseInt(log.topics[3], 16);
                        break;
                    }
                }
            }
        }

  return {
            txHash: hash,
            ipAssetId: ipAssetId,
            blockNumber: receipt.blockNumber,
            explorerUrl: `${BLOCK_EXPLORER_URL}/tx/${hash}`,
        };
    } catch (error) {
        console.error('Error registering IP with Etherlink:', error);
        throw error;
    }
};

export const mintLicenseOnEtherlink = async (
    tokenId: number,
    royaltyPercentage: number,
    duration: number,
    commercialUse: boolean,
    terms: string,
    modredIpContractAddress: Address
) => {
    try {
        const { request } = await publicClient.simulateContract({
            address: modredIpContractAddress,
            abi: MODRED_IP_ABI,
            functionName: 'mintLicense',
            args: [
                BigInt(tokenId),
                BigInt(royaltyPercentage),
                BigInt(duration),
                commercialUse,
                terms
            ],
            account: account.address,
        });

        const hash = await walletClient.writeContract({
            ...request,
            account: account,
        });

        const receipt = await publicClient.waitForTransactionReceipt({ hash });

        return {
            txHash: hash,
    blockNumber: receipt.blockNumber,
            explorerUrl: `${BLOCK_EXPLORER_URL}/tx/${hash}`,
  };
    } catch (error) {
        console.error('Error minting license on Etherlink:', error);
        throw error;
    }
};

