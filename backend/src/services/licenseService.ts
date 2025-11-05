import { mintLicenseOnEtherlink } from './storyService';
import { Address } from 'viem';
import { BLOCK_EXPLORER_URL } from '../utils/config';
import { convertBigIntsToStrings } from '../utils/bigIntSerializer';

export interface LicenseRequest {
    tokenId: number;
    royaltyPercentage: number;
    duration: number;
    commercialUse: boolean;
    terms: string;
    modredIpContractAddress: Address;
}

export const mintLicense = async (licenseRequest: LicenseRequest) => {
    try {
        const {
            txHash,
            blockNumber,
            explorerUrl
        } = await mintLicenseOnEtherlink(
            licenseRequest.tokenId,
            licenseRequest.royaltyPercentage,
            licenseRequest.duration,
            licenseRequest.commercialUse,
            licenseRequest.terms,
            licenseRequest.modredIpContractAddress
        );

        const result = {
            success: true,
            txHash,
            blockNumber,
            explorerUrl,
            message: 'License minted successfully on Etherlink'
        };

        // Convert any BigInt values to strings for JSON serialization
        return convertBigIntsToStrings(result);
    } catch (error) {
        console.error('Error minting license:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            message: 'Failed to mint license on Etherlink'
        };
    }
};

export const getLicenseExplorerUrl = (txHash: string): string => {
    return `${BLOCK_EXPLORER_URL}/tx/${txHash}`;
}; 