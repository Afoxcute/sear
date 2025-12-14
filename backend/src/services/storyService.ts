import { mintNFT } from '../utils/functions/mintNFT';
import { createCommercialRemixTerms, NFTContractAddress, WIP_TOKEN_ADDRESS } from '../utils/utils';
import { publicClient, walletClient, account, networkInfo, BLOCK_EXPLORER_URL } from '../utils/config';
import { uploadJSONToIPFS } from '../utils/functions/uploadToIpfs';
import { createHash } from 'crypto';
import { Address } from 'viem';

// IP Metadata interface for Mantle
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

// Sear contract ABI (simplified for IP registration)
const SEAR_ABI = [
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
    },
    {
        "inputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            },
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "name": "tokenLicenses",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

// Helper function to check if a tokenId already has licenses
export const checkExistingLicenses = async (
    tokenId: number,
    searContractAddress: Address
): Promise<boolean> => {
    try {
        // For public mappings to arrays, Solidity generates a getter that takes (key, index)
        // Try to read index 0 - if it succeeds, there's at least one license
        try {
            const licenseId = await publicClient.readContract({
                address: searContractAddress,
                abi: SEAR_ABI,
                functionName: 'tokenLicenses',
                args: [BigInt(tokenId), BigInt(0)],
            });

            // If we successfully read index 0, there's at least one license
            console.log(`✅ Found existing license for tokenId ${tokenId}: licenseId ${licenseId}`);
            return true;
        } catch (indexError: any) {
            // If reading index 0 fails, it means the array is empty or doesn't exist
            const errorMsg = indexError?.message || String(indexError || '');
            if (errorMsg.includes('execution reverted') || errorMsg.includes('out of bounds')) {
                // Array is empty - no licenses exist
                console.log(`ℹ️ No existing licenses found for tokenId ${tokenId}`);
                return false;
            }
            // Some other error - rethrow
            throw indexError;
        }
    } catch (error) {
        // If the function doesn't exist or there's an error, log it but don't fail
        // This allows the system to work even if the contract doesn't have this function
        console.warn('⚠️ Could not check existing licenses:', error);
        return false; // Default to allowing minting if we can't check
    }
};

export const registerIpWithMantle = async (
    ipHash: string,
    metadata: string,
    isEncrypted: boolean,
    searContractAddress: Address
) => {
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            console.log('ipHash:', ipHash);
            console.log('metadata:', metadata);
            console.log('isEncrypted:', isEncrypted);

            // Register IP on Sear contract
            const { request } = await publicClient.simulateContract({
                address: searContractAddress,
                abi: SEAR_ABI,
                functionName: 'registerIP',
                args: [
                    ipHash,
                    metadata,
                    isEncrypted
                ],
                account: account.address,
            });

            // Add a small delay before fetching nonce to reduce race conditions
            if (attempt > 0) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                console.log(`⏳ Waiting ${delayMs}ms before retry attempt ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // Fetch current nonce including pending transactions to avoid "nonce too low" errors
            // Using 'pending' block tag ensures we get the most up-to-date nonce
            const nonce = await publicClient.getTransactionCount({
                address: account.address,
                blockTag: 'pending', // Include pending transactions
            });

            console.log(`📊 Current nonce for ${account.address}: ${nonce} (attempt ${attempt + 1}/${maxRetries})`);

            const hash = await walletClient.writeContract({
                ...request,
                account: account,
                nonce: nonce,
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
        } catch (error: any) {
            lastError = error;
            
            // Check if error is due to nonce issues or duplicate transaction
            const errorMessage = error?.message || error?.shortMessage || String(error || '');
            const errorDetails = error?.details || '';
            
            const isNonceError = errorMessage.includes('nonce') || 
                                errorMessage.includes('already known') || 
                                errorDetails.includes('already known');
            
            if (isNonceError && attempt < maxRetries - 1) {
                console.warn(`⚠️ Nonce error on attempt ${attempt + 1}, will retry...`);
                continue; // Retry with fresh nonce
            }
            
            // If it's not a nonce error or we've exhausted retries, throw
            throw error;
        }
    }
    
    // If we get here, all retries failed
    console.error('Error registering IP with Mantle after all retries:', lastError);
    
    // Provide a more helpful error message
    const errorMessage = lastError?.message || lastError?.shortMessage || String(lastError || '');
    const errorDetails = lastError?.details || '';
    
    if (errorMessage.includes('nonce') || errorMessage.includes('already known') || errorDetails.includes('already known')) {
        console.warn('⚠️ Nonce or duplicate transaction error detected after all retries.');
        console.warn('💡 This usually means:');
        console.warn('   1. A transaction with the same nonce was already submitted');
        console.warn('   2. There are pending transactions that need to be confirmed first');
        console.warn('   3. Multiple requests were sent simultaneously');
        console.warn('💡 Solution: Wait a few seconds for pending transactions to confirm, then try again.');
        
        throw new Error(
            `Transaction failed due to nonce conflict after ${maxRetries} retries. The transaction may have already been submitted, ` +
            `or there are pending transactions. Please wait a few seconds and try again. ` +
            `If the issue persists, check the blockchain explorer for pending transactions. ` +
            `Original error: ${errorMessage}`
        );
    }
    
    throw lastError;
};

export const mintLicenseOnMantle = async (
    tokenId: number,
    royaltyPercentage: number,
    duration: number,
    commercialUse: boolean,
    terms: string,
    searContractAddress: Address
) => {
    const maxRetries = 3;
    let lastError: any = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const { request } = await publicClient.simulateContract({
                address: searContractAddress,
                abi: SEAR_ABI,
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

            // Add a small delay before fetching nonce to reduce race conditions
            if (attempt > 0) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff, max 5s
                console.log(`⏳ Waiting ${delayMs}ms before retry attempt ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }

            // Fetch current nonce including pending transactions to avoid "nonce too low" errors
            // Using 'pending' block tag ensures we get the most up-to-date nonce
            const nonce = await publicClient.getTransactionCount({
                address: account.address,
                blockTag: 'pending', // Include pending transactions
            });

            console.log(`📊 Current nonce for ${account.address}: ${nonce} (attempt ${attempt + 1}/${maxRetries})`);

            const hash = await walletClient.writeContract({
                ...request,
                account: account,
                nonce: nonce,
            });

            const receipt = await publicClient.waitForTransactionReceipt({ hash });

            return {
                txHash: hash,
                blockNumber: receipt.blockNumber,
                explorerUrl: `${BLOCK_EXPLORER_URL}/tx/${hash}`,
            };
        } catch (error: any) {
            lastError = error;
            
            // Check if error is due to nonce issues or duplicate transaction
            const errorMessage = error?.message || error?.shortMessage || String(error || '');
            const errorDetails = error?.details || '';
            
            const isNonceError = errorMessage.includes('nonce') || 
                                errorMessage.includes('already known') || 
                                errorDetails.includes('already known');
            
            if (isNonceError && attempt < maxRetries - 1) {
                console.warn(`⚠️ Nonce error on attempt ${attempt + 1}, will retry...`);
                continue; // Retry with fresh nonce
            }
            
            // If it's not a nonce error or we've exhausted retries, throw
            throw error;
        }
    }
    
    // If we get here, all retries failed
    console.error('Error minting license on Mantle after all retries:', lastError);
    
    // Provide a more helpful error message
    const errorMessage = lastError?.message || lastError?.shortMessage || String(lastError || '');
    const errorDetails = lastError?.details || '';
    
    if (errorMessage.includes('nonce') || errorMessage.includes('already known') || errorDetails.includes('already known')) {
        console.warn('⚠️ Nonce or duplicate transaction error detected after all retries.');
        console.warn('💡 This usually means:');
        console.warn('   1. A transaction with the same nonce was already submitted');
        console.warn('   2. There are pending transactions that need to be confirmed first');
        console.warn('   3. Multiple requests were sent simultaneously');
        console.warn('💡 Solution: Wait a few seconds for pending transactions to confirm, then try again.');
        
        throw new Error(
            `Transaction failed due to nonce conflict after ${maxRetries} retries. The transaction may have already been submitted, ` +
            `or there are pending transactions. Please wait a few seconds and try again. ` +
            `If the issue persists, check the blockchain explorer for pending transactions. ` +
            `Original error: ${errorMessage}`
        );
    }
    
    throw lastError;
};

