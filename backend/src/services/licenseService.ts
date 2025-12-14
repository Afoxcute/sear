import { mintLicenseOnMantle, checkExistingLicenses } from './storyService';
import { Address } from 'viem';
import { BLOCK_EXPLORER_URL } from '../utils/config';
import { convertBigIntsToStrings } from '../utils/bigIntSerializer';

export interface LicenseRequest {
    tokenId: number;
    royaltyPercentage: number;
    duration: number;
    commercialUse: boolean;
    terms: string;
    searContractAddress: Address;
}

export const mintLicense = async (licenseRequest: LicenseRequest) => {
    try {
        // Check if a license already exists for this IP (tokenId)
        const hasExistingLicense = await checkExistingLicenses(
            licenseRequest.tokenId,
            licenseRequest.searContractAddress
        );

        if (hasExistingLicense) {
            return {
                success: false,
                error: 'A license already exists for this IP asset. Only one license can be minted per IP.',
                message: 'License minting failed: IP already has a license'
            };
        }

        const {
            txHash,
            blockNumber,
            explorerUrl
        } = await mintLicenseOnMantle(
            licenseRequest.tokenId,
            licenseRequest.royaltyPercentage,
            licenseRequest.duration,
            licenseRequest.commercialUse,
            licenseRequest.terms,
            licenseRequest.searContractAddress
        );

        const result = {
            success: true,
            txHash,
            blockNumber,
            explorerUrl,
            message: 'License minted successfully on Mantle'
        };

        // Convert any BigInt values to strings for JSON serialization
        return convertBigIntsToStrings(result);
    } catch (error) {
        console.error('Error minting license:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to mint license on Mantle'
        };
    }
};

export const getLicenseExplorerUrl = (txHash: string): string => {
    return `${BLOCK_EXPLORER_URL}/tx/${txHash}`;
}; 