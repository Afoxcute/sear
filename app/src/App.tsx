import { useEffect, useState } from "react";
import "./App.css";
import { useNotificationHelpers } from "./contexts/NotificationContext";
import { NotificationButton } from "./components/NotificationButton";
import { NotificationToasts } from "./components/NotificationCenter";
import { IPPortfolio } from "./components/IPPortfolio";
import "./components/IPPortfolio.css";

import {
  defineChain,
  getContract,
  prepareContractCall,
  readContract,
  sendTransaction,
  ThirdwebClient,
  waitForReceipt,
} from "thirdweb";
import { ConnectButton, useActiveAccount } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { parseEther, formatEther } from "viem";
import CONTRACT_ADDRESS_JSON from "./deployed_addresses.json";

// Custom Mantle Sepolia Testnet chain definition with official RPC URL
const mantleTestnet = {
  id: 5003,
  name: "Mantle Sepolia Testnet",
  nativeCurrency: {
    name: "MNT",
    symbol: "MNT",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://mantle-sepolia.drpc.org"],
    },
    public: {
      http: ["https://mantle-sepolia.drpc.org"],
    },
  },
  blockExplorers: {
    default: {
      name: "Mantle Testnet Explorer",
      url: "https://explorer.testnet.mantle.xyz",
    },
  },
  testnet: true,
};

// Backend API configuration
const BACKEND_URL = "http://localhost:5000";

// File validation and preview utilities
const MAX_FILE_SIZE_MB = 50; // Maximum file size in megabytes
const ALLOWED_FILE_TYPES = [
  'application/pdf',     // PDF
  'application/msword',  // DOC
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'text/plain',          // TXT
  'image/jpeg',          // JPG/JPEG
  'image/png',           // PNG
  'image/gif',           // GIF
  'audio/mpeg',          // MP3
  'audio/wav',           // WAV
  'video/mp4'            // MP4
];

// File validation function
const validateFile = (file: File): { valid: boolean; error?: string } => {
  // Check file size
  const fileSizeMB = file.size / (1024 * 1024);
  if (fileSizeMB > MAX_FILE_SIZE_MB) {
    return {
      valid: false, 
      error: `File size exceeds ${MAX_FILE_SIZE_MB}MB limit`
    };
  }

  // Check file type
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false, 
      error: 'Unsupported file type'
    };
  }

  return { valid: true };
};

// File preview generator
const generateFilePreview = (file: File): Promise<string | null> => {
  return new Promise((resolve) => {
    // Preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsDataURL(file);
    } 
    // Preview for PDFs (basic)
    else if (file.type === 'application/pdf') {
      resolve('📄 PDF Document');
    }
    // Preview for text files
    else if (file.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.readAsText(file);
    }
    // Preview for other file types
    else {
      resolve(null);
    }
  });
};

// Remove hardcoded Pinata credentials
const PINATA_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI5MjJjNmZkOC04ZTZhLTQxMzUtODA4ZS05ZTkwZTMyMjViNTIiLCJlbWFpbCI6Imp3YXZvbGFiaWxvdmUwMDE2QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJwaW5fcG9saWN5Ijp7InJlZ2lvbnMiOlt7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6IkZSQTEifSx7ImRlc2lyZWRSZXBsaWNhdGlvbkNvdW50IjoxLCJpZCI6Ik5ZQzEifV0sInZlcnNpb24iOjF9LCJtZmFfZW5hYmxlZCI6ZmFsc2UsInN0YXR1cyI6IkFDVElWRSJ9LCJhdXRoZW50aWNhdGlvblR5cGUiOiJzY29wZWRLZXkiLCJzY29wZWRLZXlLZXkiOiJkZDI1MzM4YmRmYTdjNzlmYjY4NyIsInNjb3BlZEtleVNlY3JldCI6ImFiYTJjMzcwNWExMzNlZmVjNzM3NzQwZGNjMGJjOTE4MGY2M2IzZjkxY2E5MzVlYWE3NzUxMDhjOGNkYjMyZDciLCJleHAiOjE3ODU3NDg3ODh9.I6RIrBphVycV-75XK_pippeZngj6QntUZZjFMnGtqFA";

/**
 * Uploads a file to IPFS via Pinata
 * @param file The file to upload
 * @returns Object with success status, CID and message
 */
const pinFileToIPFS = async (file: File): Promise<{
  success: boolean;
  cid?: string;
  message?: string;
}> => {
  try {
    // Validate JWT is present
    if (!PINATA_JWT) {
      throw new Error('Pinata JWT is not configured. Please set VITE_PINATA_JWT in your environment.');
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);

    // Add metadata
    const metadata = {
      name: file.name,
      description: `Uploaded via Sear frontend`,
      attributes: {
        uploadedBy: 'Sear',
        timestamp: new Date().toISOString(),
        fileType: file.type,
        fileSize: file.size
      }
    };
    formData.append('pinataMetadata', JSON.stringify(metadata));

    // Make request to Pinata
    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PINATA_JWT}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Pinata API Error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });
      throw new Error(`Pinata upload failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Pinata upload successful:', result);

    return {
      success: true,
      cid: result.IpfsHash,
      message: 'File uploaded successfully to IPFS'
    };
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Converts an IPFS URL to a gateway URL for better compatibility
 * @param url IPFS URL (ipfs://, /ipfs/, or already a gateway URL)
 * @returns Gateway URL
 */
const getIPFSGatewayURL = (url: string): string => {
  if (!url) return '';

  // Use preferred gateway
  const gateway = 'https://gateway.pinata.cloud';

  // Handle ipfs:// protocol
  if (url.startsWith('ipfs://')) {
    const cid = url.replace('ipfs://', '');
    return `${gateway}/ipfs/${cid}`;
  }

  // Handle /ipfs/ path
  if (url.includes('/ipfs/')) {
    const parts = url.split('/ipfs/');
    if (parts.length > 1) {
      return `${gateway}/ipfs/${parts[1]}`;
    }
  }

  // If it's already a gateway URL or something else, return as is
  return url;
};

// Parse metadata to extract name and description
const parseMetadata = async (metadataUri: string) => {
  try {
    // If metadata is a direct JSON string, parse it
    if (metadataUri.startsWith('{')) {
      return JSON.parse(metadataUri);
    }
    
    // If it's an IPFS URI, fetch it
    if (metadataUri.startsWith('ipfs://')) {
      const gatewayUrl = getIPFSGatewayURL(metadataUri);
      const response = await fetch(gatewayUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      
      const metadata = await response.json();
      return metadata;
    }
    
    // If it's already a gateway URL, fetch it
    if (metadataUri.includes('gateway.pinata.cloud')) {
      const response = await fetch(metadataUri);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      
      const metadata = await response.json();
      return metadata;
    }
    
    // Default fallback
    return {
      name: "Unknown",
      description: "No description available"
    };
  } catch (error) {
    console.error('Error parsing metadata:', error);
    return {
      name: "Unknown",
      description: "No description available"
    };
  }
};

const wallets = [
  inAppWallet({
    auth: {
      options: ["google", "email", "passkey", "phone"],
    },
  }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("io.rabby"),
  createWallet("com.trustwallet.app"),
  createWallet("global.safe"),
];

// Sear Contract ABI (simplified for the functions we need)
const SEAR_ABI = [
  {
    inputs: [
      { name: "tokenId", type: "uint256" }
    ],
    name: "getIPAsset",
    outputs: [
      { name: "owner", type: "address" },
      { name: "ipHash", type: "string" },
      { name: "metadata", type: "string" },
      { name: "isEncrypted", type: "bool" },
      { name: "isDisputed", type: "bool" },
      { name: "registrationDate", type: "uint256" },
      { name: "totalRevenue", type: "uint256" },
      { name: "royaltyTokens", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "licenseId", type: "uint256" }
    ],
    name: "getLicense",
    outputs: [
      { name: "licensee", type: "address" },
      { name: "tokenId", type: "uint256" },
      { name: "royaltyPercentage", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "startDate", type: "uint256" },
      { name: "isActive", type: "bool" },
      { name: "commercialUse", type: "bool" },
      { name: "terms", type: "string" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "claimant", type: "address" }
    ],
    name: "getRoyaltyInfo",
    outputs: [
      { name: "totalRevenue", type: "uint256" },
      { name: "claimableAmount", type: "uint256" },
      { name: "lastClaimed", type: "uint256" },
      { name: "totalAccumulated", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextTokenId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextLicenseId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "ipHash", type: "string" },
      { name: "metadata", type: "string" },
      { name: "isEncrypted", type: "bool" }
    ],
    name: "registerIP",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "royaltyPercentage", type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "commercialUse", type: "bool" },
      { name: "terms", type: "string" }
    ],
    name: "mintLicense",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" }
    ],
    name: "payRevenue",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" }
    ],
    name: "claimRoyalties",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "reason", type: "string" }
    ],
    name: "raiseDispute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "registerArbitrator",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [],
    name: "unstake",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" },
      { name: "selectedArbitrators", type: "address[]" }
    ],
    name: "assignArbitrators",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" },
      { name: "decision", type: "bool" },
      { name: "resolution", type: "string" }
    ],
    name: "submitArbitrationDecision",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" }
    ],
    name: "checkAndResolveArbitration",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" }
    ],
    name: "resolveArbitrationAfterDeadline",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" }
    ],
    name: "resolveDisputeWithoutArbitrators",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" }
    ],
    name: "getTokenDisputes",
    outputs: [
      { name: "", type: "uint256[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" }
    ],
    name: "hasActiveDisputes",
    outputs: [
      { name: "", type: "bool" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "to", type: "address" }
    ],
    name: "transferIP",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "disputeId", type: "uint256" }
    ],
    name: "getDispute",
    outputs: [
      { name: "disputeId_", type: "uint256" },
      { name: "tokenId_", type: "uint256" },
      { name: "disputer_", type: "address" },
      { name: "reason_", type: "string" },
      { name: "timestamp_", type: "uint256" },
      { name: "isResolved_", type: "bool" },
      { name: "arbitrationId_", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "arbitrationId", type: "uint256" }
    ],
    name: "getArbitration",
    outputs: [
      { name: "arbitrationId_", type: "uint256" },
      { name: "disputeId_", type: "uint256" },
      { name: "arbitrators_", type: "address[]" },
      { name: "votesFor_", type: "uint256" },
      { name: "votesAgainst_", type: "uint256" },
      { name: "deadline_", type: "uint256" },
      { name: "isResolved_", type: "bool" },
      { name: "resolution_", type: "string" },
      { name: "threeUpholdVotesTimestamp_", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "arbitrator", type: "address" }
    ],
    name: "getArbitratorActiveDisputes",
    outputs: [
      { name: "", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "arbitrator", type: "address" }
    ],
    name: "getArbitrator",
    outputs: [
      { name: "arbitrator_", type: "address" },
      { name: "stake_", type: "uint256" },
      { name: "reputation_", type: "uint256" },
      { name: "totalCases_", type: "uint256" },
      { name: "successfulCases_", type: "uint256" },
      { name: "isActive_", type: "bool" },
      { name: "registrationDate_", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getAllArbitrators",
    outputs: [
      { name: "", type: "address[]" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      { name: "", type: "address" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "MIN_ARBITRATOR_STAKE",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "REQUIRED_ARBITRATORS",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "getActiveArbitratorsCount",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "nextDisputeId",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

interface IPAsset {
  owner: string;
  ipHash: string;
  metadata: string;
  isEncrypted: boolean;
  isDisputed: boolean;
  registrationDate: bigint;
  totalRevenue: bigint;
  royaltyTokens: bigint;
}

interface License {
  licensee: string;
  tokenId: bigint;
  royaltyPercentage: bigint;
  duration: bigint;
  startDate: bigint;
  isActive: boolean;
  commercialUse: boolean;
  terms: string;
}

interface AppProps {
  thirdwebClient: ThirdwebClient;
}

// License Template Interface
interface LicenseTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  royaltyPercentage: number;
  duration: number; // in seconds
  commercialUse: boolean;
  commercialAttribution: boolean;
  derivativesAllowed: boolean;
  derivativesAttribution: boolean;
  derivativesApproval: boolean;
  derivativesReciprocal: boolean;
  commercialRevShare: number; // in basis points (100000000 = 100%)
  commercialRevCeiling: number;
  derivativeRevCeiling: number;
  commercializerChecker: string;
  commercializerCheckerData: string;
  currency: string;
}

// Predefined License Templates
const LICENSE_TEMPLATES: LicenseTemplate[] = [
  {
    id: "commercial",
    name: "Commercial License",
    description: "Full commercial rights with attribution. Allows commercial use, derivatives, and sharing.",
    icon: "💼",
    royaltyPercentage: 15,
    duration: 31536000, // 1 year
    commercialUse: true,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: false,
    commercialRevShare: 100000000, // 100%
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "non-commercial",
    name: "Non-Commercial License",
    description: "Non-commercial use only. Allows derivatives and sharing, but no commercial use.",
    icon: "🚫",
    royaltyPercentage: 10,
    duration: 31536000, // 1 year
    commercialUse: false,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: true,
    commercialRevShare: 0,
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "cc-by",
    name: "Creative Commons BY",
    description: "Attribution required. Allows commercial use, derivatives, and sharing with credit.",
    icon: "📝",
    royaltyPercentage: 5,
    duration: 31536000, // 1 year
    commercialUse: true,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: false,
    commercialRevShare: 50000000, // 50%
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "cc-by-nc",
    name: "Creative Commons BY-NC",
    description: "Attribution required, non-commercial only. No commercial use, but allows derivatives and sharing.",
    icon: "🎨",
    royaltyPercentage: 5,
    duration: 31536000, // 1 year
    commercialUse: false,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: true,
    commercialRevShare: 0,
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "cc-by-sa",
    name: "Creative Commons BY-SA",
    description: "Attribution-ShareAlike. Allows commercial use and derivatives, but derivatives must use same license.",
    icon: "🔗",
    royaltyPercentage: 10,
    duration: 31536000, // 1 year
    commercialUse: true,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: true,
    commercialRevShare: 75000000, // 75%
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "all-rights",
    name: "All Rights Reserved",
    description: "Strict license. No commercial use, no derivatives. Attribution required for any use.",
    icon: "🔒",
    royaltyPercentage: 20,
    duration: 31536000, // 1 year
    commercialUse: false,
    commercialAttribution: true,
    derivativesAllowed: false,
    derivativesAttribution: false,
    derivativesApproval: false,
    derivativesReciprocal: false,
    commercialRevShare: 0,
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "public-domain",
    name: "Public Domain",
    description: "No restrictions. Free for commercial use, derivatives, and sharing. No attribution required.",
    icon: "🌍",
    royaltyPercentage: 0,
    duration: 31536000, // 1 year
    commercialUse: true,
    commercialAttribution: false,
    derivativesAllowed: true,
    derivativesAttribution: false,
    derivativesApproval: false,
    derivativesReciprocal: false,
    commercialRevShare: 0,
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "exclusive",
    name: "Exclusive Commercial",
    description: "Exclusive commercial license with high royalty. No derivatives, commercial use only with approval.",
    icon: "⭐",
    royaltyPercentage: 25,
    duration: 63072000, // 2 years
    commercialUse: true,
    commercialAttribution: true,
    derivativesAllowed: false,
    derivativesAttribution: false,
    derivativesApproval: true,
    derivativesReciprocal: false,
    commercialRevShare: 100000000, // 100%
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  },
  {
    id: "custom",
    name: "Custom License",
    description: "Manually configure all license parameters to your specific needs.",
    icon: "⚙️",
    royaltyPercentage: 10,
    duration: 86400, // 1 day default
    commercialUse: true,
    commercialAttribution: true,
    derivativesAllowed: true,
    derivativesAttribution: true,
    derivativesApproval: false,
    derivativesReciprocal: true,
    commercialRevShare: 100000000, // 100%
    commercialRevCeiling: 0,
    derivativeRevCeiling: 0,
    commercializerChecker: "0x0000000000000000000000000000000000000000",
    commercializerCheckerData: "0000000000000000000000000000000000000000",
    currency: "0x15140000000000000000000000000000000000000"
  }
];

// Enhanced Asset Preview Component
const EnhancedAssetPreview: React.FC<{
  assetId: number;
  asset: IPAsset;
  metadata: any;
  mediaUrl: string;
}> = ({ assetId, asset, metadata, mediaUrl }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Extract IPFS hash from various formats
  const extractIPFSHash = (input: string): string | null => {
    if (!input) return null;
    
    // Handle ipfs:// protocol
    if (input.startsWith('ipfs://')) {
      return input.replace('ipfs://', '').split('/')[0];
    }
    
    // Handle /ipfs/ path
    if (input.includes('/ipfs/')) {
      const parts = input.split('/ipfs/');
      if (parts.length > 1) {
        return parts[1].split('/')[0];
      }
    }
    
    // If it's already a gateway URL, extract the hash
    if (input.includes('gateway.pinata.cloud/ipfs/') || input.includes('ipfs.io/ipfs/')) {
      const match = input.match(/ipfs\/([^/?]+)/);
      if (match) return match[1];
    }
    
    // If it looks like a hash (Qm... or bafy...), return as is
    if (/^[Qmb][a-zA-Z0-9]{40,}$/.test(input)) {
      return input;
    }
    
    return null;
  };

  // Convert IPFS hash to gateway URL
  const hashToGatewayURL = (hash: string): string => {
    if (!hash) return '';
    return `https://gateway.pinata.cloud/ipfs/${hash}`;
  };

  useEffect(() => {
    const fetchImageFromMetadata = async () => {
      try {
        setLoading(true);
        
        let finalUrl: string | null = null;
        
        // Priority 1: Use asset's ipHash directly (most reliable)
        if (asset.ipHash) {
          const hash = extractIPFSHash(asset.ipHash);
          if (hash) {
            finalUrl = hashToGatewayURL(hash);
          } else {
            // If ipHash is already a URL, use it
            finalUrl = asset.ipHash;
          }
        }
        
        // Priority 2: Check metadata.image field
        if (!finalUrl && metadata?.image) {
          const hash = extractIPFSHash(metadata.image);
          if (hash) {
            finalUrl = hashToGatewayURL(hash);
          } else if (metadata.image.startsWith('http')) {
            finalUrl = metadata.image;
          }
        }
        
        // Priority 3: Use mediaUrl prop
        if (!finalUrl && mediaUrl) {
          const hash = extractIPFSHash(mediaUrl);
          if (hash) {
            finalUrl = hashToGatewayURL(hash);
          } else {
            finalUrl = mediaUrl;
          }
        }
        
        // Priority 4: Check metadata properties for ipHash
        if (!finalUrl && metadata?.properties?.ipHash) {
          const hash = extractIPFSHash(metadata.properties.ipHash);
          if (hash) {
            finalUrl = hashToGatewayURL(hash);
          }
        }
        
        setImageUrl(finalUrl);
      } catch (error) {
        console.error('Error fetching image from metadata:', error);
        // Fallback to mediaUrl
        if (mediaUrl) {
          const hash = extractIPFSHash(mediaUrl);
          setImageUrl(hash ? hashToGatewayURL(hash) : mediaUrl);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchImageFromMetadata();
  }, [metadata, asset.ipHash, mediaUrl]);

  if (loading) {
    return (
      <div className="preview-skeleton">
        <div className="skeleton skeleton-image"></div>
      </div>
    );
  }

  return (
    <>
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={metadata?.name || `IP Asset ${assetId}`}
          className="media-image"
          onError={(e) => {
            const imgElement = e.target as HTMLImageElement;
            imgElement.style.display = 'none';
            const fallback = imgElement.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = 'flex';
          }}
        />
      ) : null}
      <div className="media-fallback" style={{ display: imageUrl ? 'none' : 'flex' }}>
        <div className="media-fallback-icon">📄</div>
        <p>Media Preview</p>
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="media-link">
          🔗 View Media
        </a>
        )}
        {!imageUrl && asset.ipHash && (
          <a href={hashToGatewayURL(extractIPFSHash(asset.ipHash) || asset.ipHash)} target="_blank" rel="noopener noreferrer" className="media-link">
            🔗 View on IPFS
          </a>
        )}
      </div>
    </>
  );
};

export default function App({ thirdwebClient }: AppProps) {
  const account = useActiveAccount();
  const { notifySuccess, notifyError, notifyWarning, notifyInfo } = useNotificationHelpers();

  const [loading, setLoading] = useState<boolean>(false);
  const [backendStatus, setBackendStatus] = useState<boolean>(false);
  
  // IP Assets state
  const [ipAssets, setIpAssets] = useState<Map<number, IPAsset>>(new Map());
  
  // Licenses state
  const [licenses, setLicenses] = useState<Map<number, License>>(new Map());
  
  // Parsed metadata state
  const [parsedMetadata, setParsedMetadata] = useState<Map<number, any>>(new Map());
  
  // Form states
  const [ipFile, setIpFile] = useState<File | null>(null);
  const [ipHash, setIpHash] = useState<string>("");
  const [ipName, setIpName] = useState<string>("");
  const [ipDescription, setIpDescription] = useState<string>("");
  const [isEncrypted, setIsEncrypted] = useState<boolean>(false);
  
  const [selectedTokenId, setSelectedTokenId] = useState<number>(1);
  const [royaltyPercentage, setRoyaltyPercentage] = useState<number>(10);
  const [licenseDuration, setLicenseDuration] = useState<number>(86400);
  // License parameters
  const [commercialUse, setCommercialUse] = useState<boolean>(true);
  const [commercialAttribution, setCommercialAttribution] = useState<boolean>(true);
  const [commercializerChecker, setCommercializerChecker] = useState<string>("0x0000000000000000000000000000000000000000");
  const [commercializerCheckerData, setCommercializerCheckerData] = useState<string>("0000000000000000000000000000000000000000");
  const [commercialRevShare, setCommercialRevShare] = useState<number>(100000000);
  const [commercialRevCeiling, setCommercialRevCeiling] = useState<number>(0);
  const [derivativesAllowed, setDerivativesAllowed] = useState<boolean>(true);
  const [derivativesAttribution, setDerivativesAttribution] = useState<boolean>(true);
  const [derivativesApproval, setDerivativesApproval] = useState<boolean>(false);
  const [derivativesReciprocal, setDerivativesReciprocal] = useState<boolean>(true);
  const [derivativeRevCeiling, setDerivativeRevCeiling] = useState<number>(0);
  const [licenseCurrency, setLicenseCurrency] = useState<string>("0x15140000000000000000000000000000000000000");
  const [selectedLicenseTemplate, setSelectedLicenseTemplate] = useState<string>("custom");
  
  const [paymentAmount, setPaymentAmount] = useState<string>("0.001");
  const [paymentTokenId, setPaymentTokenId] = useState<number>(1);
  
  const [claimTokenId, setClaimTokenId] = useState<number>(1);

  // Royalty calculation states
  interface RoyaltyBreakdown {
    totalAmount: number;
    platformFee: number;
    remainingAfterFee: number;
    licenseRoyalties: Array<{
      licenseId: number;
      licensee: string;
      royaltyPercentage: number;
      amount: number;
    }>;
    ipOwnerShare: number;
  }

  const [royaltyBreakdown, setRoyaltyBreakdown] = useState<RoyaltyBreakdown | null>(null);
  const [accumulatedRoyalties, setAccumulatedRoyalties] = useState<Map<number, bigint>>(new Map()); // tokenId => claimable amount

  // Constants matching contract
  const ROYALTY_DECIMALS = 10000; // 10000 = 100%
  const PLATFORM_FEE_PERCENTAGE = 250; // 2.5% = 250 basis points

  // Calculate royalty breakdown (mirrors contract logic)
  const calculateRoyaltyBreakdown = (
    paymentAmount: number,
    tokenId: number
  ): RoyaltyBreakdown | null => {
    if (!paymentAmount || paymentAmount <= 0) return null;
    if (!ipAssets.has(tokenId)) return null;

    const paymentAmountWei = parseFloat(paymentAmount.toString()) * 1e18; // Convert to wei for calculation
    const paymentAmountBigInt = BigInt(Math.floor(paymentAmountWei));

    // Calculate platform fee
    const platformFee = (paymentAmountBigInt * BigInt(PLATFORM_FEE_PERCENTAGE)) / BigInt(ROYALTY_DECIMALS);
    const remainingAfterFee = paymentAmountBigInt - platformFee;

    // Get active licenses for this token
    const activeLicenses: Array<{
      licenseId: number;
      license: License;
    }> = [];

    licenses.forEach((license, licenseId) => {
      if (
        Number(license.tokenId) === tokenId &&
        license.isActive &&
        Date.now() / 1000 < Number(license.startDate) + Number(license.duration)
      ) {
        activeLicenses.push({ licenseId, license });
      }
    });

    // Calculate license royalties
    const licenseRoyalties = activeLicenses.map(({ licenseId, license }) => {
      const royaltyAmount = (remainingAfterFee * license.royaltyPercentage) / BigInt(ROYALTY_DECIMALS);
      return {
        licenseId,
        licensee: license.licensee,
        royaltyPercentage: Number(license.royaltyPercentage) / 100, // Convert to percentage
        amount: Number(royaltyAmount) / 1e18, // Convert from wei
      };
    });

    const totalLicenseRoyalties = licenseRoyalties.reduce((sum, lr) => sum + lr.amount, 0);
    const ipOwnerShare = Number(remainingAfterFee) / 1e18 - totalLicenseRoyalties;

    return {
      totalAmount: paymentAmount,
      platformFee: Number(platformFee) / 1e18,
      remainingAfterFee: Number(remainingAfterFee) / 1e18,
      licenseRoyalties,
      ipOwnerShare: Math.max(0, ipOwnerShare), // Ensure non-negative
    };
  };

  // Load accumulated royalties for a token
  const loadAccumulatedRoyalties = async (tokenId: number) => {
    if (!account?.address) return;

    try {
      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      // Get royalty info for the connected account
      const royaltyInfo = await readContract({
        contract,
        method: "getRoyaltyInfo" as any,
        params: [BigInt(tokenId), account.address],
      }) as readonly [bigint, bigint, bigint, bigint];

      const claimableAmount = royaltyInfo[1]; // claimableAmount_
      setAccumulatedRoyalties((prev) => {
        const newMap = new Map(prev);
        newMap.set(tokenId, claimableAmount);
        return newMap;
      });
    } catch (error: any) {
      // Silently handle errors (e.g., if no royalties exist)
      console.log('No royalties found or error loading:', error);
      setAccumulatedRoyalties((prev) => {
        const newMap = new Map(prev);
        newMap.set(tokenId, 0n);
        return newMap;
      });
    }
  };

  // Arbitration states
  const [disputesMap, setDisputesMap] = useState<Map<number, any>>(new Map());
  // const [arbitrationsMap, setArbitrationsMap] = useState<Map<number, any>>(new Map()); // Reserved for future use
  const [arbitratorsMap, setArbitratorsMap] = useState<Map<string, any>>(new Map());
  const [disputeTokenId, setDisputeTokenId] = useState<number>(1);
  const [disputeReason, setDisputeReason] = useState<string>("");
  const [arbitrationDecision, setArbitrationDecision] = useState<boolean>(true);
  const [arbitrationResolution, setArbitrationResolution] = useState<string>("");
  const [arbitrationDisputeId, setArbitrationDisputeId] = useState<number>(0);
  const [minArbitratorStake, setMinArbitratorStake] = useState<string>("0.000000001");
  const [allArbitrators, setAllArbitrators] = useState<string[]>([]);
  const [activeArbitratorsCount, setActiveArbitratorsCount] = useState<number>(0);
  const [resolveDisputeId, setResolveDisputeId] = useState<number>(0);
  const [assignDisputeId, setAssignDisputeId] = useState<number>(0);
  const [selectedArbitrators, setSelectedArbitrators] = useState<string[]>([]);
  const [arbitrationsMap, setArbitrationsMap] = useState<Map<number, any>>(new Map());
  const [isOwner, setIsOwner] = useState<boolean>(false);

  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'register' | 'license' | 'revenue' | 'arbitration' | 'activity' | 'transfer'>('dashboard');

  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchScope, setSearchScope] = useState<'all' | 'assets' | 'licenses' | 'disputes'>('all');
  const [filterType, setFilterType] = useState<'assets' | 'licenses' | 'disputes'>('assets');
  
  // Filters
  const [assetFilters, setAssetFilters] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    minRevenue: '',
    maxRevenue: '',
    infringementStatus: 'all' as 'all' | 'none' | 'any' | 'low' | 'medium' | 'high' | 'critical',
    licenseStatus: 'all' as 'all' | 'licensed' | 'unlicensed',
    ownerFilter: 'all' as 'all' | 'mine' | 'others',
    disputed: 'all' as 'all' | 'disputed' | 'not-disputed',
    encrypted: 'all' as 'all' | 'encrypted' | 'not-encrypted'
  });

  const [licenseFilters, setLicenseFilters] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    status: 'all' as 'all' | 'active' | 'inactive',
    commercialUse: 'all' as 'all' | 'commercial' | 'non-commercial',
    licenseeFilter: 'all' as 'all' | 'mine' | 'others'
  });

  const [disputeFilters, setDisputeFilters] = useState({
    name: '',
    dateFrom: '',
    dateTo: '',
    status: 'all' as 'all' | 'resolved' | 'pending',
    disputerFilter: 'all' as 'all' | 'mine' | 'others'
  });

  // Sort options
  const [assetSortBy, setAssetSortBy] = useState<'date' | 'revenue' | 'name' | 'infringements'>('date');
  const [assetSortOrder, setAssetSortOrder] = useState<'asc' | 'desc'>('desc');
  const [licenseSortBy, setLicenseSortBy] = useState<'date' | 'royalty' | 'name'>('date');
  const [licenseSortOrder, setLicenseSortOrder] = useState<'asc' | 'desc'>('desc');
  const [disputeSortBy, setDisputeSortBy] = useState<'date' | 'id'>('date');
  const [disputeSortOrder, setDisputeSortOrder] = useState<'asc' | 'desc'>('desc');

  // Activity History States
  interface Activity {
    id: string;
    type: 'registration' | 'license' | 'payment' | 'dispute' | 'transfer' | 'royalty' | 'arbitration';
    timestamp: number;
    assetId?: number;
    assetName?: string;
    description: string;
    txHash?: string;
    blockNumber?: bigint;
    actor?: string;
    amount?: bigint;
    status?: string;
  }

  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityLoading, setActivityLoading] = useState<boolean>(false);
  const [activityFilters, setActivityFilters] = useState({
    type: 'all' as 'all' | 'registration' | 'license' | 'payment' | 'dispute' | 'transfer' | 'royalty' | 'arbitration',
    dateFrom: '',
    dateTo: '',
    assetId: '',
    searchQuery: ''
  });

  // Transfer & Gift States
  interface TransferRecord {
    id: string;
    tokenId: number;
    from: string;
    to: string;
    timestamp: number;
    txHash: string;
    blockNumber: bigint;
    isGift: boolean;
    giftMessage?: string;
    assetName?: string;
  }

  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [transferLoading, setTransferLoading] = useState<boolean>(false);
  const [transferForm, setTransferForm] = useState({
    tokenId: '',
    recipient: '',
    isGift: false,
    giftMessage: ''
  });
  const [transferMode, setTransferMode] = useState<'transfer' | 'gift' | 'history'>('transfer');
  const [transferFilters, setTransferFilters] = useState({
    tokenId: '',
    from: '',
    to: '',
    dateFrom: '',
    dateTo: '',
    showGiftsOnly: false
  });
  // Approval workflow state
  const [transferApproval, setTransferApproval] = useState<{
    show: boolean;
    tokenId: number | null;
    recipient: string;
    isGift: boolean;
    giftMessage: string;
    assetName?: string;
  }>({
    show: false,
    tokenId: null,
    recipient: '',
    isGift: false,
    giftMessage: ''
  });

  // Infringement detection states
  interface InfringementData {
    id: string;
    status: string;
    result: string;
    inNetworkInfringements: Array<{
      id?: string;
      url?: string;
      similarity?: number;
      detected_at?: string;
      type?: string;
    }>;
    externalInfringements: Array<{
      id?: string;
      url?: string;
      similarity?: number;
      detected_at?: string;
      type?: string;
      platform?: string;
    }>;
    credits?: {
      used?: number;
      remaining?: number;
    };
    lastChecked: string | null;
    totalInfringements: number;
  }

  const [infringementData, setInfringementData] = useState<Map<number, InfringementData>>(new Map());
  const [infringementLoading, setInfringementLoading] = useState<Map<number, boolean>>(new Map());

  // Load infringement status for an IP asset
  const loadInfringementStatus = async (tokenId: number) => {
    if (!ipAssets.has(tokenId)) {
      console.warn(`IP Asset ${tokenId} not found`);
      return;
    }

    try {
      setInfringementLoading((prev) => {
        const newMap = new Map(prev);
        newMap.set(tokenId, true);
        return newMap;
      });
      const contractAddress = CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"].toLowerCase();
      const response = await fetch(`${BACKEND_URL}/api/infringement/status/${contractAddress}/${tokenId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch infringement status: ${response.statusText}`);
      }

      const result = await response.json();
      const infringementStatus: InfringementData = result.data;

      setInfringementData((prev) => {
        const newMap = new Map(prev);
        newMap.set(tokenId, infringementStatus);
        return newMap;
      });

    } catch (error: any) {
      console.error('Error loading infringement status:', error);
      // Don't show error for 404s (IP might not be registered in Yakoa yet)
      if (!error.message?.includes('404')) {
        console.warn('Infringement check failed:', error.message || 'Failed to check infringement status');
      }
    } finally {
      setInfringementLoading((prev) => {
        const newMap = new Map(prev);
        newMap.set(tokenId, false);
        return newMap;
      });
    }
  };

  // Calculate infringement severity
  const calculateSeverity = (infringement: InfringementData): 'low' | 'medium' | 'high' | 'critical' => {
    if (infringement.totalInfringements === 0) return 'low';
    
    const hasHighSimilarity = [
      ...infringement.inNetworkInfringements,
      ...infringement.externalInfringements
    ].some(inf => (inf.similarity || 0) > 0.9);

    if (hasHighSimilarity && infringement.totalInfringements > 5) return 'critical';
    if (hasHighSimilarity || infringement.totalInfringements > 3) return 'high';
    if (infringement.totalInfringements > 1) return 'medium';
    return 'low';
  };

  // Load Activity History
  const loadActivityHistory = async () => {
    if (!account?.address) return;

    try {
      setActivityLoading(true);
      const newActivities: Activity[] = [];

      // Add IP Registration activities
      for (const [tokenId, asset] of ipAssets.entries()) {
        const metadata = parsedMetadata.get(tokenId) || {};
        const assetName = metadata.name || `IP Asset #${tokenId}`;
        const timestamp = Number(asset.registrationDate) * 1000;
        
        newActivities.push({
          id: `reg-${tokenId}`,
          type: 'registration',
          timestamp,
          assetId: tokenId,
          assetName,
          description: `IP Asset "${assetName}" registered`,
          actor: asset.owner,
        });
      }

      // Add License activities
      for (const [licenseId, license] of licenses.entries()) {
        const metadata = parsedMetadata.get(Number(license.tokenId)) || {};
        const assetName = metadata.name || `IP Asset #${license.tokenId}`;
        const timestamp = Number(license.startDate) * 1000;
        
        newActivities.push({
          id: `license-${licenseId}`,
          type: 'license',
          timestamp,
          assetId: Number(license.tokenId),
          assetName,
          description: `License #${licenseId} minted for "${assetName}" by ${license.licensee.slice(0, 6)}...${license.licensee.slice(-4)}`,
          actor: license.licensee,
        });
      }

      // Add Revenue Payment activities (from totalRevenue)
      for (const [tokenId, asset] of ipAssets.entries()) {
        if (asset.totalRevenue > 0n) {
          const metadata = parsedMetadata.get(tokenId) || {};
          const assetName = metadata.name || `IP Asset #${tokenId}`;
          
          newActivities.push({
            id: `revenue-${tokenId}-${Date.now()}`,
            type: 'payment',
            timestamp: Date.now() - Math.random() * 86400000, // Random time in last 24h
            assetId: tokenId,
            assetName,
            description: `Revenue payment of ${formatEther(asset.totalRevenue)} MNT for "${assetName}"`,
            amount: asset.totalRevenue,
          });
        }
      }

      // Add Dispute activities
      for (const [disputeId, dispute] of disputesMap.entries()) {
        const metadata = parsedMetadata.get(Number(dispute.tokenId)) || {};
        const assetName = metadata.name || `IP Asset #${dispute.tokenId}`;
        const timestamp = Number(dispute.timestamp) * 1000;
        
        newActivities.push({
          id: `dispute-${disputeId}`,
          type: 'dispute',
          timestamp,
          assetId: Number(dispute.tokenId),
          assetName,
          description: `Dispute #${disputeId} raised for "${assetName}": ${dispute.reason}`,
          actor: dispute.disputer,
          status: dispute.isResolved ? 'Resolved' : 'Pending',
        });
      }

      // Sort by timestamp (newest first)
      newActivities.sort((a, b) => b.timestamp - a.timestamp);

      setActivities(newActivities);
    } catch (error) {
      console.error('Error loading activity history:', error);
      notifyError('Activity History Error', 'Failed to load activity history');
    } finally {
      setActivityLoading(false);
    }
  };

  // Filter activities
  const filterActivities = (activitiesList: Activity[]) => {
    let filtered = [...activitiesList];

    // Filter by type
    if (activityFilters.type !== 'all') {
      filtered = filtered.filter(a => a.type === activityFilters.type);
    }

    // Filter by date range
    if (activityFilters.dateFrom) {
      const fromDate = new Date(activityFilters.dateFrom).getTime();
      filtered = filtered.filter(a => a.timestamp >= fromDate);
    }
    if (activityFilters.dateTo) {
      const toDate = new Date(activityFilters.dateTo).getTime() + 86400000; // Add 1 day to include the end date
      filtered = filtered.filter(a => a.timestamp <= toDate);
    }

    // Filter by asset ID
    if (activityFilters.assetId) {
      const assetIdNum = parseInt(activityFilters.assetId);
      if (!isNaN(assetIdNum)) {
        filtered = filtered.filter(a => a.assetId === assetIdNum);
      }
    }

    // Filter by search query
    if (activityFilters.searchQuery.trim()) {
      const query = activityFilters.searchQuery.toLowerCase();
      filtered = filtered.filter(a => 
        a.description.toLowerCase().includes(query) ||
        a.assetName?.toLowerCase().includes(query) ||
        a.actor?.toLowerCase().includes(query) ||
        a.assetId?.toString().includes(query)
      );
    }

    return filtered;
  };

  // Export to CSV
  const exportToCSV = () => {
    const filtered = filterActivities(activities);
    const headers = ['Type', 'Date', 'Asset ID', 'Asset Name', 'Description', 'Actor', 'Amount (MNT)', 'Status', 'Transaction Hash'];
    const rows = filtered.map(activity => [
      activity.type,
      new Date(activity.timestamp).toLocaleString(),
      activity.assetId?.toString() || '',
      activity.assetName || '',
      activity.description,
      activity.actor || '',
      activity.amount ? formatEther(activity.amount) : '',
      activity.status || '',
      activity.txHash || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activity-history-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export to PDF (using browser print)
  const exportToPDF = () => {
    const filtered = filterActivities(activities);
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Activity History Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .header { margin-bottom: 20px; }
            .date { color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Activity History Report</h1>
            <p class="date">Generated: ${new Date().toLocaleString()}</p>
            <p>Total Activities: ${filtered.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Date</th>
                <th>Asset ID</th>
                <th>Asset Name</th>
                <th>Description</th>
                <th>Actor</th>
                <th>Amount (MNT)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(activity => `
                <tr>
                  <td>${activity.type}</td>
                  <td>${new Date(activity.timestamp).toLocaleString()}</td>
                  <td>${activity.assetId || ''}</td>
                  <td>${activity.assetName || ''}</td>
                  <td>${activity.description}</td>
                  <td>${activity.actor || ''}</td>
                  <td>${activity.amount ? formatEther(activity.amount) : ''}</td>
                  <td>${activity.status || ''}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  // Load transfer history from blockchain events and activity history
  const loadTransferHistory = async () => {
    if (!account?.address) return;

    try {
      setTransferLoading(true);
      const newTransfers: TransferRecord[] = [];

      // First, get transfers from activity history (these are already recorded)
      const transferActivities = activities.filter(a => a.type === 'transfer');
      for (const activity of transferActivities) {
        if (activity.txHash && activity.assetId) {
          const metadata = parsedMetadata.get(activity.assetId) || {};
          const assetName = metadata.name || `IP Asset #${activity.assetId}`;
          
          // Try to extract from/to from description or use activity data
          const fromMatch = activity.description.match(/from\s+([0-9a-fA-Fx]{42})/i);
          const toMatch = activity.description.match(/to\s+([0-9a-fA-Fx]{42})/i);
          
          newTransfers.push({
            id: `transfer-${activity.assetId}-${activity.timestamp}`,
            tokenId: activity.assetId,
            from: activity.actor || (fromMatch ? fromMatch[1] : 'Unknown'),
            to: (toMatch ? toMatch[1] : 'Unknown'),
            timestamp: activity.timestamp,
            txHash: activity.txHash,
            blockNumber: activity.blockNumber || 0n,
            isGift: activity.description.toLowerCase().includes('gift'),
            giftMessage: activity.description.toLowerCase().includes('gift') ? activity.description : undefined,
            assetName
          });
        }
      }

      // Also try to query blockchain events for IPTransferred
      // Note: In production, you'd use getLogs to query IPTransferred events directly
      // For now, we rely on activity history which is populated when transfers occur
      try {
        // Future enhancement: Query IPTransferred events from blockchain
        // const contract = getContract({...});
        // const logs = await getLogs({...});
      } catch (e) {
        console.log("Note: Could not query blockchain events directly. Using activity history.");
      }

      // Sort by timestamp (newest first)
      newTransfers.sort((a, b) => b.timestamp - a.timestamp);
      setTransferHistory(newTransfers);
    } catch (error) {
      console.error("Error loading transfer history:", error);
    } finally {
      setTransferLoading(false);
    }
  };

  // Load activities when tab is active or data changes
  useEffect(() => {
    if (activeTab === 'activity' && account?.address) {
      loadActivityHistory();
    }
    if (activeTab === 'transfer' && account?.address) {
      loadTransferHistory();
    }
  }, [activeTab, account?.address, ipAssets.size, licenses.size, disputesMap.size]);

  // Filter and Sort Functions
  const filterAndSortAssets = (assets: Map<number, IPAsset>) => {
    let filtered = Array.from(assets.entries());

    // Apply search query
    if (searchQuery.trim() && (searchScope === 'all' || searchScope === 'assets')) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(([id, asset]) => {
        const metadata = parsedMetadata.get(id) || {};
        const name = (metadata.name || '').toLowerCase();
        const description = (metadata.description || '').toLowerCase();
        const ipHash = asset.ipHash.toLowerCase();
        return name.includes(query) || description.includes(query) || ipHash.includes(query) || id.toString().includes(query);
      });
    }

    // Apply filters
    if (assetFilters.name) {
      const nameQuery = assetFilters.name.toLowerCase();
      filtered = filtered.filter(([id]) => {
        const metadata = parsedMetadata.get(id) || {};
        return (metadata.name || '').toLowerCase().includes(nameQuery);
      });
    }

    if (assetFilters.dateFrom) {
      const fromDate = new Date(assetFilters.dateFrom).getTime() / 1000;
      filtered = filtered.filter(([_, asset]) => Number(asset.registrationDate) >= fromDate);
    }

    if (assetFilters.dateTo) {
      const toDate = new Date(assetFilters.dateTo).getTime() / 1000;
      filtered = filtered.filter(([_, asset]) => Number(asset.registrationDate) <= toDate);
    }

    if (assetFilters.minRevenue) {
      const minRev = parseEther(assetFilters.minRevenue);
      filtered = filtered.filter(([_, asset]) => asset.totalRevenue >= minRev);
    }

    if (assetFilters.maxRevenue) {
      const maxRev = parseEther(assetFilters.maxRevenue);
      filtered = filtered.filter(([_, asset]) => asset.totalRevenue <= maxRev);
    }

    if (assetFilters.infringementStatus !== 'all') {
      filtered = filtered.filter(([id, _]) => {
        if (!infringementData.has(id)) {
          return assetFilters.infringementStatus === 'none';
        }
        const infringement = infringementData.get(id)!;
        if (assetFilters.infringementStatus === 'none') {
          return infringement.totalInfringements === 0;
        }
        // For 'any' filter, show all assets with any infringements
        if (assetFilters.infringementStatus === 'any') {
          return infringement.totalInfringements > 0;
        }
        // For 'high' filter, show high and critical
        if (assetFilters.infringementStatus === 'high') {
          const severity = calculateSeverity(infringement);
          return severity === 'high' || severity === 'critical';
        }
        const severity = calculateSeverity(infringement);
        return severity === assetFilters.infringementStatus;
      });
    }

    if (assetFilters.licenseStatus !== 'all') {
      filtered = filtered.filter(([id, _]) => {
        const hasLicense = Array.from(licenses.values()).some(license => Number(license.tokenId) === id);
        if (assetFilters.licenseStatus === 'licensed') {
          return hasLicense;
        } else {
          return !hasLicense;
        }
      });
    }

    if (assetFilters.ownerFilter !== 'all' && account?.address) {
      filtered = filtered.filter(([_, asset]) => {
        if (assetFilters.ownerFilter === 'mine') {
          return asset.owner.toLowerCase() === account.address.toLowerCase();
        } else {
          return asset.owner.toLowerCase() !== account.address.toLowerCase();
        }
      });
    }

    if (assetFilters.disputed !== 'all') {
      filtered = filtered.filter(([_, asset]) => {
        if (assetFilters.disputed === 'disputed') {
          return asset.isDisputed;
        } else {
          return !asset.isDisputed;
        }
      });
    }

    if (assetFilters.encrypted !== 'all') {
      filtered = filtered.filter(([_, asset]) => {
        if (assetFilters.encrypted === 'encrypted') {
          return asset.isEncrypted;
        } else {
          return !asset.isEncrypted;
        }
      });
    }

    // Apply sorting
    filtered.sort(([idA, assetA], [idB, assetB]) => {
      let comparison = 0;
      
      switch (assetSortBy) {
        case 'date':
          comparison = Number(assetA.registrationDate) - Number(assetB.registrationDate);
          break;
        case 'revenue':
          comparison = Number(assetA.totalRevenue) - Number(assetB.totalRevenue);
          break;
        case 'name':
          const metadataA = parsedMetadata.get(idA) || { name: '' };
          const metadataB = parsedMetadata.get(idB) || { name: '' };
          comparison = (metadataA.name || '').localeCompare(metadataB.name || '');
          break;
        case 'infringements':
          const infA = infringementData.get(idA);
          const infB = infringementData.get(idB);
          const countA = infA ? infA.totalInfringements : 0;
          const countB = infB ? infB.totalInfringements : 0;
          comparison = countA - countB;
          break;
      }
      
      return assetSortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const filterAndSortLicenses = (licensesMap: Map<number, License>) => {
    let filtered = Array.from(licensesMap.entries());

    // Apply search query
    if (searchQuery.trim() && (searchScope === 'all' || searchScope === 'licenses')) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(([id, license]) => {
        const metadata = parsedMetadata.get(Number(license.tokenId)) || {};
        const name = (metadata.name || '').toLowerCase();
        const terms = license.terms.toLowerCase();
        return name.includes(query) || terms.includes(query) || id.toString().includes(query);
      });
    }

    // Apply filters
    if (licenseFilters.name) {
      const nameQuery = licenseFilters.name.toLowerCase();
      filtered = filtered.filter(([_, license]) => {
        const metadata = parsedMetadata.get(Number(license.tokenId)) || {};
        return (metadata.name || '').toLowerCase().includes(nameQuery);
      });
    }

    if (licenseFilters.dateFrom) {
      const fromDate = new Date(licenseFilters.dateFrom).getTime() / 1000;
      filtered = filtered.filter(([_, license]) => Number(license.startDate) >= fromDate);
    }

    if (licenseFilters.dateTo) {
      const toDate = new Date(licenseFilters.dateTo).getTime() / 1000;
      filtered = filtered.filter(([_, license]) => Number(license.startDate) <= toDate);
    }

    if (licenseFilters.status !== 'all') {
      filtered = filtered.filter(([_, license]) => {
        if (licenseFilters.status === 'active') {
          return license.isActive;
        } else {
          return !license.isActive;
        }
      });
    }

    if (licenseFilters.commercialUse !== 'all') {
      filtered = filtered.filter(([_, license]) => {
        if (licenseFilters.commercialUse === 'commercial') {
          return license.commercialUse;
        } else {
          return !license.commercialUse;
        }
      });
    }

    if (licenseFilters.licenseeFilter !== 'all' && account?.address) {
      filtered = filtered.filter(([_, license]) => {
        if (licenseFilters.licenseeFilter === 'mine') {
          return license.licensee.toLowerCase() === account.address.toLowerCase();
        } else {
          return license.licensee.toLowerCase() !== account.address.toLowerCase();
        }
      });
    }

    // Apply sorting
    filtered.sort(([, licenseA], [, licenseB]) => {
      let comparison = 0;
      
      switch (licenseSortBy) {
        case 'date':
          comparison = Number(licenseA.startDate) - Number(licenseB.startDate);
          break;
        case 'royalty':
          comparison = Number(licenseA.royaltyPercentage) - Number(licenseB.royaltyPercentage);
          break;
        case 'name':
          const metadataA = parsedMetadata.get(Number(licenseA.tokenId)) || { name: '' };
          const metadataB = parsedMetadata.get(Number(licenseB.tokenId)) || { name: '' };
          comparison = (metadataA.name || '').localeCompare(metadataB.name || '');
          break;
      }
      
      return licenseSortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  const filterAndSortDisputes = (disputesMap: Map<number, any>) => {
    let filtered = Array.from(disputesMap.entries());

    // Apply search query
    if (searchQuery.trim() && (searchScope === 'all' || searchScope === 'disputes')) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(([id, dispute]) => {
        const metadata = parsedMetadata.get(dispute.tokenId) || {};
        const name = (metadata.name || '').toLowerCase();
        const reason = dispute.reason.toLowerCase();
        return name.includes(query) || reason.includes(query) || id.toString().includes(query) || dispute.disputeId.toString().includes(query);
      });
    }

    // Apply filters
    if (disputeFilters.name) {
      const nameQuery = disputeFilters.name.toLowerCase();
      filtered = filtered.filter(([_, dispute]) => {
        const metadata = parsedMetadata.get(dispute.tokenId) || {};
        return (metadata.name || '').toLowerCase().includes(nameQuery);
      });
    }

    if (disputeFilters.dateFrom) {
      const fromDate = new Date(disputeFilters.dateFrom).getTime() / 1000;
      filtered = filtered.filter(([_, dispute]) => Number(dispute.timestamp) >= fromDate);
    }

    if (disputeFilters.dateTo) {
      const toDate = new Date(disputeFilters.dateTo).getTime() / 1000;
      filtered = filtered.filter(([_, dispute]) => Number(dispute.timestamp) <= toDate);
    }

    if (disputeFilters.status !== 'all') {
      filtered = filtered.filter(([_, dispute]) => {
        if (disputeFilters.status === 'resolved') {
          return dispute.isResolved;
        } else {
          return !dispute.isResolved;
        }
      });
    }

    if (disputeFilters.disputerFilter !== 'all' && account?.address) {
      filtered = filtered.filter(([_, dispute]) => {
        if (disputeFilters.disputerFilter === 'mine') {
          return dispute.disputer.toLowerCase() === account.address.toLowerCase();
        } else {
          return dispute.disputer.toLowerCase() !== account.address.toLowerCase();
        }
      });
    }

    // Apply sorting
    filtered.sort(([_, disputeA], [__, disputeB]) => {
      let comparison = 0;
      
      switch (disputeSortBy) {
        case 'date':
          comparison = Number(disputeA.timestamp) - Number(disputeB.timestamp);
          break;
        case 'id':
          comparison = disputeA.disputeId - disputeB.disputeId;
          break;
      }
      
      return disputeSortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  };

  // Quick filter handlers
  const applyQuickFilter = (filter: 'my-assets' | 'licensed' | 'with-infringements' | 'high-revenue') => {
    setFilterType('assets');
    const newFilters = { ...assetFilters };
    
    if (filter === 'my-assets') {
      newFilters.ownerFilter = 'mine';
      newFilters.licenseStatus = 'all';
      newFilters.infringementStatus = 'all';
      newFilters.minRevenue = '';
    } else if (filter === 'licensed') {
      newFilters.ownerFilter = 'all';
      newFilters.licenseStatus = 'licensed';
      newFilters.infringementStatus = 'all';
      newFilters.minRevenue = '';
    } else if (filter === 'with-infringements') {
      newFilters.ownerFilter = 'all';
      newFilters.licenseStatus = 'all';
      newFilters.infringementStatus = 'any'; // Shows all assets with any infringements
      newFilters.minRevenue = '';
    } else if (filter === 'high-revenue') {
      newFilters.ownerFilter = 'all';
      newFilters.licenseStatus = 'all';
      newFilters.infringementStatus = 'all';
      newFilters.minRevenue = '0.1';
    }
    
    setAssetFilters(newFilters);
  };

  // Check backend status
  const checkBackendStatus = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/`);
      const wasConnected = backendStatus;
      const isConnected = response.ok;
      
      setBackendStatus(isConnected);
      
      if (!wasConnected && isConnected) {
        notifySuccess('Backend Connected', 'Successfully connected to the Sear backend service');
      } else if (wasConnected && !isConnected) {
        notifyError('Backend Disconnected', 'Lost connection to the Sear backend service');
      }
    } catch (error) {
      const wasConnected = backendStatus;
      setBackendStatus(false);
      
      if (wasConnected) {
        notifyError('Backend Error', 'Failed to connect to the Sear backend service');
      }
    }
  };

  // Check backend status on component mount
  useEffect(() => {
    checkBackendStatus();
  }, []);

  // Handle file selection for IP asset
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await processFile(files[0]);
    }
  };

  // Process file (shared logic for both upload methods)
  const processFile = async (file: File) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      notifyError('Invalid File', validation.error || 'Invalid file selected');
      return;
    }

    try {
      const preview = await generateFilePreview(file);
      setFilePreview(preview);
      setIpFile(file);
      notifyInfo('File Selected', `${file.name} selected for upload`);
    } catch (err) {
      console.error('File preview error:', err);
      setIpFile(file);
      notifyWarning('Preview Error', 'File selected but preview could not be generated');
    }
  };

  // Upload file to IPFS
  const uploadToIPFS = async () => {
    if (!ipFile) {
      notifyError("No File Selected", "Please select a file to upload");
      return null;
    }

    try {
      setLoading(true);
      notifyInfo('Uploading to IPFS', `Uploading ${ipFile.name} to IPFS...`);
      
      const uploadResult = await pinFileToIPFS(ipFile);
      
      if (uploadResult.success && uploadResult.cid) {
        // Clear any previous file preview
        setFilePreview(null);
        
        // Set the IPFS hash
        const ipfsUrl = `ipfs://${uploadResult.cid}`;
        setIpHash(ipfsUrl);
        
        // Get gateway URL for display
        const gatewayUrl = getIPFSGatewayURL(ipfsUrl);
        
        // Show success message
        notifySuccess('IPFS Upload Successful', 
          `File uploaded successfully!\nCID: ${uploadResult.cid}`, 
          {
            action: {
              label: 'View File',
              onClick: () => window.open(gatewayUrl, '_blank')
            }
          }
        );
        
        return uploadResult.cid;
    } else {
        // Handle specific upload errors
        const errorMessage = uploadResult.message || "Failed to upload file";
        notifyError('Upload Failed', errorMessage);
        
        // Reset file selection if upload fails
        setIpFile(null);
        setFilePreview(null);
        
        return null;
      }
    } catch (err: any) {
      console.error('Unexpected upload error:', err);
      notifyError('Upload Error', err.message || "Unexpected error during file upload");
      
      // Reset file selection
      setIpFile(null);
      setFilePreview(null);
      
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Load contract data
  const loadContractData = async () => {
    if (!account?.address) return;

    try {
      setLoading(true);
      const contractAddress = CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"];
      console.log("📋 Using Sear Contract:", contractAddress);
      
      const contract = getContract({
        abi: SEAR_ABI,
          client: thirdwebClient,
          chain: defineChain(mantleTestnet.id),
        address: contractAddress,
      });

      // Get next token ID with error handling
      let nextTokenIdNum = 1;
      try {
        const nextId = await readContract({
          contract,
          method: "nextTokenId",
          params: [],
        });
        nextTokenIdNum = Number(nextId);
        console.log("✅ Loaded nextTokenId:", nextTokenIdNum);
      } catch (error: any) {
        console.warn("⚠️ Error loading nextTokenId:", error?.message || error);
        // If it's a zero data error, the contract might not be fully deployed
        if (error?.message?.includes("zero data") || error?.message?.includes("Cannot decode")) {
          console.warn("⚠️ Contract function 'nextTokenId' returned no data. Contract may not be deployed or function not implemented.");
        }
        // Use default value of 1 (no tokens registered yet)
        nextTokenIdNum = 1;
      }

      // Get next license ID with error handling
      let nextLicenseIdNum = 1;
      try {
        const nextLicenseId = await readContract({
          contract,
          method: "nextLicenseId",
          params: [],
        });
        nextLicenseIdNum = Number(nextLicenseId);
        console.log("✅ Loaded nextLicenseId:", nextLicenseIdNum);
      } catch (error: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = error?.message || error?.shortMessage || String(error || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'nextLicenseId' not available (contract may not be fully deployed). Using default value.");
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading nextLicenseId:", errorMessage);
        }
        // Use default value of 1 (no licenses registered yet)
        nextLicenseIdNum = 1;
      }

      // Load IP assets
      const newIpAssets = new Map<number, IPAsset>();
      for (let i = 1; i < nextTokenIdNum; i++) {
        try {
          const ipAsset = await readContract({
            contract,
            method: "getIPAsset",
            params: [BigInt(i)],
          });
          newIpAssets.set(i, {
            owner: ipAsset[0],
            ipHash: ipAsset[1],
            metadata: ipAsset[2],
            isEncrypted: ipAsset[3],
            isDisputed: ipAsset[4],
            registrationDate: ipAsset[5],
            totalRevenue: ipAsset[6],
            royaltyTokens: ipAsset[7],
          });
        } catch (error) {
          // Token doesn't exist, skip
        }
      }
      setIpAssets(newIpAssets);

      // Parse metadata for all IP assets
      const newParsedMetadata = new Map<number, any>();
      for (const [id, asset] of newIpAssets.entries()) {
        try {
          const metadata = await parseMetadata(asset.metadata);
          newParsedMetadata.set(id, metadata);
        } catch (error) {
          console.error(`Error parsing metadata for token ${id}:`, error);
          newParsedMetadata.set(id, {
            name: "Unknown",
            description: "No description available"
          });
        }
      }
      setParsedMetadata(newParsedMetadata);

      // Load licenses
      const newLicenses = new Map<number, License>();
      for (let i = 1; i < nextLicenseIdNum; i++) {
        try {
          const license = await readContract({
            contract,
            method: "getLicense",
            params: [BigInt(i)],
          });
          newLicenses.set(i, {
            licensee: license[0],
            tokenId: license[1],
            royaltyPercentage: license[2],
            duration: license[3],
            startDate: license[4],
            isActive: license[5],
            commercialUse: license[6],
            terms: license[7],
          });
        } catch (error) {
          // License doesn't exist, skip
        }
      }
      setLicenses(newLicenses);

    } catch (error: any) {
      // Only log and notify for unexpected errors, not zero data errors
      const errorMessage = error?.message || error?.shortMessage || String(error || '');
      const isZeroDataError = 
        errorMessage.includes("zero data") || 
        errorMessage.includes("Cannot decode") ||
        errorMessage.includes("AbiDecodingZeroDataError");
      
      if (!isZeroDataError) {
      console.error("Error loading contract data:", error);
      notifyError("Loading Failed", "Failed to load contract data");
      } else {
        console.log("ℹ️ Some contract functions returned zero data (expected for new contracts). Continuing with defaults.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContractData();
  }, [account?.address]);

  // Create standardized NFT metadata
  const createNFTMetadata = async (ipHash: string, name: string, description: string, isEncrypted: boolean) => {
    // Generate metadata object
    const metadata = {
      name: name || `IP Asset #${Date.now()}`, // Use provided name or generate unique name
      description: description || "No description provided",
      image: ipHash, // Use IPFS hash as image reference
      properties: {
        ipHash,
        name: name || "Unnamed",
        description: description || "No description provided",
        isEncrypted,
        uploadDate: new Date().toISOString()
      }
    };

    // Upload metadata to IPFS
    const metadataBlob = new Blob([JSON.stringify(metadata)], { type: 'application/json' });
    const metadataFile = new File([metadataBlob], 'metadata.json');
    
    const metadataUploadResult = await pinFileToIPFS(metadataFile);
    
    if (!metadataUploadResult.success || !metadataUploadResult.cid) {
      throw new Error('Failed to upload metadata to IPFS');
    }

    // Return IPFS URL for metadata
    return `ipfs://${metadataUploadResult.cid}`;
  };

  // Register IP using backend API
  const registerIP = async () => {
    if (!account?.address || !ipHash || !ipName.trim()) {
      notifyError("Missing Required Fields", "Please fill in all required fields (IP Hash and Name are required)");
      return;
    }

    try {
      setLoading(true);


      // Create and upload metadata to IPFS
      const metadataUri = await createNFTMetadata(ipHash, ipName, ipDescription, isEncrypted);

      // Prepare comprehensive IP metadata for backend and infringement detection
      const ipMetadata = {
        name: ipName,
        description: ipDescription,
        image: metadataUri,
        creator: account.address,
        created_at: new Date().toISOString(),
        // Additional metadata for better infringement detection
        content_type: ipFile?.type || 'unknown',
        file_size: ipFile?.size || 0,
        mime_type: ipFile?.type || 'unknown',
        tags: [], // Could be enhanced with user input
        category: 'general', // Could be enhanced with user input
        license_type: 'all_rights_reserved',
        commercial_use: false,
        derivatives_allowed: false,
        creator_email: 'creator@sear.com', // Could be enhanced with user input
        // File-specific metadata
        file_name: ipFile?.name || 'unknown',
        file_extension: ipFile?.name?.split('.').pop() || 'unknown',
        upload_timestamp: new Date().toISOString(),
        // Blockchain metadata
        network: 'mantle',
        chain_id: '5003',
        contract_address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
        // Infringement detection metadata
        monitoring_enabled: true,
        infringement_alerts: true,
        content_hash: ipHash,
        original_filename: ipFile?.name || 'unknown'
      };

      // Prepare NFT metadata for backend
      // const nftMetadata = {
      //   name: ipName,
      //   description: ipDescription,
      //   image: metadataUri,
      //   attributes: [
      //     {
      //       trait_type: "IP Hash",
      //       value: ipHash
      //     },
      //     {
      //       trait_type: "Creator",
      //       value: account.address
      //     },
      //     {
      //       trait_type: "Encrypted",
      //       value: isEncrypted
      //     }
      //   ]
      // };

      // Call backend API
      // Note: If contract doesn't have registerIP function, set skipContractCall: true to test IPFS upload
      const response = await fetch(`${BACKEND_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ipHash: ipHash,
          metadata: JSON.stringify(ipMetadata),
          isEncrypted: isEncrypted,
          searContractAddress: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
          skipContractCall: false // V2 contract has registerIP function, so this should be false
        })
      });

      if (!response.ok) {
        let errorMessage = 'Failed to register IP';
        let errorData: any = {};
        try {
          errorData = await response.json();
          errorMessage = errorData.error || errorData.details || errorMessage;
          console.error('Registration error details:', errorData);
          
          // If the error suggests using testing mode, provide helpful message
          if (errorData.suggestion || errorMessage.includes('does not exist')) {
            errorMessage = `${errorMessage}\n\n${errorData.suggestion || 'The contract function does not exist. You can test IPFS upload by setting skipContractCall: true in the request.'}`;
          }
        } catch (parseError) {
          // If response is not JSON, try to get text
          const text = await response.text();
          errorMessage = text || errorMessage;
          console.error('Registration error (non-JSON):', text);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('IP Registration successful:', result);

      // Show success notification
      if (result.testing) {
        notifySuccess('IP Asset Metadata Created (Testing Mode)', 
          `IPFS upload successful!\nIP Hash: ${result.mantle.ipHash}\n\nNote: Contract registration was skipped (testing mode).`
        );
      } else {
      notifySuccess('IP Asset Registered', 
        `Successfully registered IP asset!\nTransaction: ${result.mantle.txHash}\nIP Asset ID: ${result.mantle.ipAssetId}`,
        {
          action: {
            label: 'View Transaction',
            onClick: () => window.open(`https://explorer.testnet.mantle.xyz/tx/${result.mantle.txHash}`, '_blank')
          }
        }
      );
      }

      // Reset form
      setIpFile(null);
      setIpHash("");
      setIpName("");
      setIpDescription("");
      setIsEncrypted(false);
      setFilePreview(null);

      // Reload data
      await loadContractData();

      } catch (error) {
      console.error("Error registering IP:", error);
      notifyError('Registration Failed', error instanceof Error ? error.message : "Failed to register IP asset");
    } finally {
      setLoading(false);
    }
  };

  // Format duration for display
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)} days`;
    if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months`;
    return `${Math.floor(seconds / 31536000)} years`;
  };

  // Apply license template to form
  const applyLicenseTemplate = (templateId: string) => {
    const template = LICENSE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    
    setSelectedLicenseTemplate(templateId);
    setRoyaltyPercentage(template.royaltyPercentage);
    setLicenseDuration(template.duration);
    setCommercialUse(template.commercialUse);
    setCommercialAttribution(template.commercialAttribution);
    setDerivativesAllowed(template.derivativesAllowed);
    setDerivativesAttribution(template.derivativesAttribution);
    setDerivativesApproval(template.derivativesApproval);
    setDerivativesReciprocal(template.derivativesReciprocal);
    setCommercialRevShare(template.commercialRevShare);
    setCommercialRevCeiling(template.commercialRevCeiling);
    setDerivativeRevCeiling(template.derivativeRevCeiling);
    setCommercializerChecker(template.commercializerChecker);
    setCommercializerCheckerData(template.commercializerCheckerData);
    setLicenseCurrency(template.currency);
    
    if (templateId !== "custom") {
      notifyInfo('Template Applied', `${template.icon} ${template.name} template has been applied. You can still customize the settings.`);
    }
  };

  // Mint License using backend API
  const mintLicense = async () => {
    if (!account?.address || !selectedTokenId) {
      notifyError("Missing Required Fields", "Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);


      // Prepare license terms for backend
      const licenseTerms = {
        tokenId: selectedTokenId,
        royaltyPercentage: royaltyPercentage,
        duration: licenseDuration,
        commercialUse: commercialUse,
        terms: JSON.stringify({
          transferable: true,
          commercialAttribution: commercialAttribution,
          commercializerChecker: commercializerChecker,
          commercializerCheckerData: commercializerCheckerData,
          commercialRevShare: commercialRevShare,
          commercialRevCeiling: commercialRevCeiling,
          derivativesAllowed: derivativesAllowed,
          derivativesAttribution: derivativesAttribution,
          derivativesApproval: derivativesApproval,
          derivativesReciprocal: derivativesReciprocal,
          derivativeRevCeiling: derivativeRevCeiling,
          currency: licenseCurrency
        })
      };

      // Call backend API
      const response = await fetch(`${BACKEND_URL}/api/license/mint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenId: selectedTokenId,
          royaltyPercentage: royaltyPercentage,
          duration: licenseDuration,
          commercialUse: commercialUse,
          terms: licenseTerms.terms,
          searContractAddress: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"]
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to mint license');
      }

      const result = await response.json();
      console.log('License minting successful:', result);

      // Show success notification
      notifySuccess('License Minted', 
        `Successfully minted license!\nTransaction: ${result.data.txHash}`,
        {
          action: {
            label: 'View Transaction',
            onClick: () => window.open(`https://explorer.testnet.mantle.xyz/tx/${result.data.txHash}`, '_blank')
          }
        }
      );

      // Reset form
      setSelectedTokenId(1);
      setSelectedLicenseTemplate("custom");
      setRoyaltyPercentage(10);
      setLicenseDuration(86400);
      setCommercialUse(true);
      setCommercialAttribution(true);
      setCommercializerChecker("0x0000000000000000000000000000000000000000");
      setCommercializerCheckerData("0000000000000000000000000000000000000000");
      setCommercialRevShare(100000000);
      setCommercialRevCeiling(0);
      setDerivativesAllowed(true);
      setDerivativesAttribution(true);
      setDerivativesApproval(false);
      setDerivativesReciprocal(true);
      setDerivativeRevCeiling(0);
      setLicenseCurrency("0x15140000000000000000000000000000000000000");

      // Reload data
      await loadContractData();

    } catch (error) {
      console.error("Error minting license:", error);
      notifyError('License Minting Failed', error instanceof Error ? error.message : "Failed to mint license");
    } finally {
      setLoading(false);
    }
  };

  // Calculate and update royalty breakdown when payment amount or token changes
  useEffect(() => {
    if (paymentAmount && parseFloat(paymentAmount) > 0 && paymentTokenId) {
      const breakdown = calculateRoyaltyBreakdown(parseFloat(paymentAmount), paymentTokenId);
      setRoyaltyBreakdown(breakdown);
    } else {
      setRoyaltyBreakdown(null);
    }
  }, [paymentAmount, paymentTokenId, licenses, ipAssets]);

  // Load accumulated royalties when claim token changes
  useEffect(() => {
    if (claimTokenId && account?.address) {
      loadAccumulatedRoyalties(claimTokenId);
    }
  }, [claimTokenId, account?.address]);

  // Pay Revenue
  const payRevenue = async () => {
    if (!account?.address || !paymentAmount || parseFloat(paymentAmount) <= 0) {
      notifyError("Invalid Payment", "Please enter a valid payment amount");
      return;
    }

    try {
      setLoading(true);
      
      // Show breakdown in notification
      if (royaltyBreakdown) {
        const breakdownText = [
          `Total: ${royaltyBreakdown.totalAmount} MNT`,
          `Platform Fee: ${royaltyBreakdown.platformFee.toFixed(6)} MNT (2.5%)`,
          ...royaltyBreakdown.licenseRoyalties.map(
            lr => `License ${lr.licenseId}: ${lr.amount.toFixed(6)} MNT (${lr.royaltyPercentage}%)`
          ),
          `IP Owner: ${royaltyBreakdown.ipOwnerShare.toFixed(6)} MNT`,
        ].join('\n');
        notifyInfo('Payment Breakdown', breakdownText);
      }
      
      notifyInfo('Processing Payment', `Paying ${paymentAmount} MNT in revenue...`);

        const contract = getContract({
        abi: SEAR_ABI,
          client: thirdwebClient,
          chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
        });

      const preparedCall = await prepareContractCall({
          contract,
        method: "payRevenue",
        params: [BigInt(paymentTokenId)],
        value: parseEther(paymentAmount),
        });

        const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
        });

      await waitForReceipt({
          client: thirdwebClient,
          chain: defineChain(mantleTestnet.id),
          transactionHash: transaction.transactionHash,
        });

      // Show success notification
      notifySuccess('Payment Successful', `Successfully paid ${paymentAmount} MNT in revenue!`);

      // Reset form
      setPaymentAmount("");
      setPaymentTokenId(1);

      // Reload data
      await loadContractData();

    } catch (error: any) {
      // Check for specific error messages in multiple possible locations
      const errorMessage = 
        error?.message || 
        error?.shortMessage || 
        error?.cause?.message || 
        error?.cause?.shortMessage ||
        error?.toString() || 
        '';
      
      // Check if it's a network/RPC error
      const isNetworkError = 
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('fetch failed') ||
        errorMessage.includes('NetworkError') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ENOTFOUND') ||
        error?.name === 'TypeError' && errorMessage.includes('fetch');
      
      if (isNetworkError) {
        console.error("Network error paying revenue:", error);
        notifyError(
          'Network Error', 
          'Failed to connect to the blockchain network. Please check your internet connection and try again. If the problem persists, the RPC endpoint may be temporarily unavailable.'
        );
      } else {
      console.error("Error paying revenue:", error);
        notifyError('Payment Failed', errorMessage || "Failed to pay revenue. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Claim Royalties
  const claimRoyalties = async () => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Claiming Royalties', 'Processing royalty claim...');

        const contract = getContract({
        abi: SEAR_ABI,
          client: thirdwebClient,
          chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
        });

      const preparedCall = await prepareContractCall({
          contract,
        method: "claimRoyalties",
        params: [BigInt(claimTokenId)],
        });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

            // Show success notification with amount
      const claimedAmount = accumulatedRoyalties.get(claimTokenId) || 0n;
      notifySuccess('Royalties Claimed', `Successfully claimed ${formatEther(claimedAmount)} MNT!`);

      // Update accumulated royalties
      setAccumulatedRoyalties((prev) => {
        const newMap = new Map(prev);
        newMap.set(claimTokenId, 0n);
        return newMap;
      });

      // Reload data
      await loadContractData();
      
      // Reload accumulated royalties
      if (claimTokenId) {
        await loadAccumulatedRoyalties(claimTokenId);
      }

    } catch (error: any) {
      // Check for specific error messages in multiple possible locations
      const errorMessage = 
        error?.message || 
        error?.shortMessage || 
        error?.cause?.message || 
        error?.cause?.shortMessage ||
        error?.toString() || 
        '';
      
      // Check if the error is about no royalties available
      const isNoRoyaltiesError = 
        errorMessage.includes('No royalties to claim') || 
        errorMessage.includes('No royalties available') ||
        errorMessage.includes('No balance to claim') ||
        (errorMessage.includes('revert') && errorMessage.includes('No royalties'));
      
      if (isNoRoyaltiesError) {
        notifyWarning('No Royalties Available', 'There are no royalties available to claim for this IP asset.');
      } else {
      console.error("Error claiming royalties:", error);
        notifyError('Claim Failed', errorMessage || "Failed to claim royalties. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Arbitration Functions
  const raiseDispute = async () => {
    if (!account?.address || !disputeReason.trim()) {
      notifyError("Invalid Input", "Please enter a dispute reason");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Raising Dispute', 'Submitting dispute...');

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "raiseDispute",
        params: [BigInt(disputeTokenId), disputeReason],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      // Get the next dispute ID (it will be the new dispute's ID)
      const nextDisputeId = await readContract({
        contract,
        method: "nextDisputeId",
        params: [],
      });
      const newDisputeId = Number(nextDisputeId) - 1; // The dispute ID that was just created
      
      // Reload data
      await loadArbitrationData();
      await loadContractData();
      
      notifySuccess('Dispute Raised', `Dispute #${newDisputeId} has been successfully raised! You can see it in the disputes list below.`);
      setDisputeReason("");
    } catch (error: any) {
      console.error("Error raising dispute:", error);
      notifyError('Dispute Failed', error?.message || "Failed to raise dispute");
    } finally {
      setLoading(false);
    }
  };

  const registerArbitrator = async () => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Registering Arbitrator', `Registering with ${minArbitratorStake} MNT stake...`);

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "registerArbitrator",
        params: [],
        value: parseEther(minArbitratorStake),
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Arbitrator Registered', 'Successfully registered as an arbitrator!');
      await loadArbitrationData();
    } catch (error: any) {
      console.error("Error registering arbitrator:", error);
      notifyError('Registration Failed', error?.message || "Failed to register as arbitrator");
    } finally {
      setLoading(false);
    }
  };

  const unstakeArbitrator = async () => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    try {
      setLoading(true);
      
      // Check arbitrator status before unstaking
      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      // Get arbitrator details
      const arbitratorDetails = await readContract({
        contract,
        method: "getArbitrator",
        params: [account.address],
      });

      const stake = arbitratorDetails[1];
      const isActive = arbitratorDetails[5];

      if (!isActive || stake === 0n) {
        notifyError('Not Registered', 'You are not registered as an active arbitrator or have no stake to withdraw.');
        return;
      }

      // Check active disputes
      let activeDisputes = 0;
      try {
        const activeDisputesCount = await readContract({
          contract,
          method: "getArbitratorActiveDisputes",
          params: [account.address],
        });
        activeDisputes = Number(activeDisputesCount);
      } catch (e: any) {
        // If function doesn't exist, calculate manually
        const arb = arbitratorsMap.get(account.address);
        activeDisputes = arb?.activeDisputes || 0;
      }

      if (activeDisputes > 0) {
        notifyError('Active Disputes', `Cannot unstake while assigned to ${activeDisputes} active dispute(s). Please wait for disputes to be resolved.`);
        return;
      }

      notifyInfo('Unstaking Arbitrator', `Withdrawing ${formatEther(stake)} MNT stake...`);

      const preparedCall = await prepareContractCall({
        contract,
        method: "unstake",
        params: [],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Stake Withdrawn', `Successfully withdrew ${formatEther(stake)} MNT! You are no longer an active arbitrator.`);
      await loadArbitrationData();
    } catch (error: any) {
      console.error("Error unstaking arbitrator:", error);
      const errorMessage = error?.message || error?.shortMessage || error?.cause?.message || "Failed to unstake";
      
      if (errorMessage.includes("Cannot unstake while assigned to active disputes")) {
        notifyError('Active Disputes', 'Cannot unstake while assigned to active disputes. Please wait for disputes to be resolved.');
      } else if (errorMessage.includes("Not registered as arbitrator")) {
        notifyError('Not Registered', 'You are not registered as an arbitrator.');
      } else if (errorMessage.includes("No stake to withdraw")) {
        notifyError('No Stake', 'You have no stake to withdraw.');
      } else {
        notifyError('Unstake Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const assignArbitrators = async (disputeId: number, selectedArbitrators: string[]) => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    if (selectedArbitrators.length === 0) {
      notifyError("Invalid Selection", "Please select at least one arbitrator");
      return;
    }

    if (selectedArbitrators.length > 3) {
      notifyError("Invalid Selection", "Maximum 3 arbitrators can be assigned");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Assigning Arbitrators', `Assigning ${selectedArbitrators.length} arbitrator(s) to dispute...`);

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "assignArbitrators",
        params: [BigInt(disputeId), selectedArbitrators],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Arbitrators Assigned', `${selectedArbitrators.length} arbitrator(s) have been assigned to dispute #${disputeId}!`);
      await loadArbitrationData();
    } catch (error: any) {
      console.error("Error assigning arbitrators:", error);
      const errorMessage = error?.message || error?.shortMessage || error?.cause?.message || "Failed to assign arbitrators";
      
      if (errorMessage.includes("Arbitrators already assigned")) {
        notifyError('Already Assigned', 'This dispute already has arbitrators assigned.');
      } else if (errorMessage.includes("Arbitrator not active")) {
        notifyError('Invalid Arbitrator', 'One or more selected arbitrators are not active.');
      } else {
        notifyError('Assignment Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const checkAndResolveArbitration = async (disputeId: number) => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    if (!isOwner) {
      notifyError("Unauthorized", "Only the contract owner can manually trigger resolution.");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Checking Resolution', 'Checking if dispute can be resolved after 24h wait period...');

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "checkAndResolveArbitration",
        params: [BigInt(disputeId)],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Dispute Resolved', 'Dispute has been resolved after 24 hour waiting period!');
      await loadArbitrationData();
      await loadContractData();
    } catch (error: any) {
      console.error("Error checking and resolving arbitration:", error);
      const errorMessage = error?.message || error?.shortMessage || error?.cause?.message || "Failed to resolve dispute";
      
      if (errorMessage.includes("Minimum uphold votes not reached")) {
        notifyError('Not Enough Votes', 'At least 3 uphold votes are required to resolve.');
      } else if (errorMessage.includes("24 hour waiting period not passed")) {
        notifyError('Waiting Period', '24 hours have not passed since 3 uphold votes were reached.');
      } else if (errorMessage.includes("Three uphold votes timestamp not set")) {
        notifyError('No Timestamp', 'Three uphold votes have not been reached yet.');
      } else {
        notifyError('Resolution Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  // Gift IP function - kept for potential future use or API compatibility
  // const giftIP = async (tokenId: number, recipient: string, giftMessage: string) => {
  //   // Gift is essentially a transfer with a message
  //   await transferIP(tokenId, recipient, true, giftMessage, false);
  // };

  // Show transfer approval dialog
  const showTransferApproval = (tokenId: number, recipient: string, isGift: boolean, giftMessage: string) => {
    const metadata = parsedMetadata.get(tokenId) || {};
    const assetName = metadata.name || `IP Asset #${tokenId}`;
    
    setTransferApproval({
      show: true,
      tokenId,
      recipient,
      isGift,
      giftMessage,
      assetName
    });
  };

  // Confirm and execute transfer
  const confirmTransfer = async () => {
    if (transferApproval.tokenId === null) return;
    
    await transferIP(
      transferApproval.tokenId,
      transferApproval.recipient,
      transferApproval.isGift,
      transferApproval.giftMessage,
      true // confirmed
    );
    
    // Close approval dialog
    setTransferApproval({
      show: false,
      tokenId: null,
      recipient: '',
      isGift: false,
      giftMessage: ''
    });
  };

  const transferIP = async (tokenId: number, recipient: string, isGift: boolean = false, giftMessage: string = '', confirmed: boolean = false) => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    if (!recipient || !recipient.trim()) {
      notifyError("Invalid Recipient", "Please enter a recipient address");
      return;
    }

    // Basic address validation
    if (!recipient.startsWith("0x") || recipient.length !== 42) {
      notifyError("Invalid Address", "Please enter a valid Ethereum address (0x...)");
      return;
    }

    // Check if user owns the token
    const asset = ipAssets.get(tokenId);
    if (!asset) {
      notifyError("Token Not Found", "IP asset not found");
      return;
    }

    if (asset.owner.toLowerCase() !== account.address.toLowerCase()) {
      notifyError("Not Owner", "You are not the owner of this IP asset");
      return;
    }

    // Show approval dialog if not confirmed
    if (!confirmed) {
      showTransferApproval(tokenId, recipient, isGift, giftMessage);
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Transferring IP', 'Initiating IP asset transfer...');

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      // Check for active disputes first
      try {
        const hasActive = await readContract({
          contract,
          method: "hasActiveDisputes",
          params: [BigInt(tokenId)],
        });
        if (hasActive) {
          // Get all disputes for this token to show details
          try {
            const disputeIds = await readContract({
              contract,
              method: "getTokenDisputes",
              params: [BigInt(tokenId)],
            });
            
            const unresolvedDisputes: number[] = [];
            for (const disputeId of disputeIds) {
              try {
                const dispute = await readContract({
                  contract,
                  method: "getDispute",
                  params: [BigInt(disputeId)],
                });
                if (!dispute[5]) { // isResolved is at index 5
                  unresolvedDisputes.push(Number(disputeId));
                }
              } catch (e) {
                console.error(`Error fetching dispute ${disputeId}:`, e);
              }
            }
            
            if (unresolvedDisputes.length > 0) {
              notifyError(
                "Active Disputes", 
                `Cannot transfer IP asset. There are ${unresolvedDisputes.length} unresolved dispute(s): ${unresolvedDisputes.join(", ")}. Please resolve all disputes first.`
              );
            } else {
              notifyError("Active Disputes", "Cannot transfer IP asset with active disputes. Please resolve all disputes first.");
            }
          } catch (e) {
            console.error("Error fetching dispute details:", e);
            notifyError("Active Disputes", "Cannot transfer IP asset with active disputes. Please resolve all disputes first.");
          }
          setLoading(false);
          return;
        }
      } catch (e) {
        console.error("Error checking active disputes:", e);
        // If the check itself fails, we should still try to proceed
        // but the contract will revert if there are active disputes
      }

      const preparedCall = await prepareContractCall({
        contract,
        method: "transferIP",
        params: [BigInt(tokenId), recipient as `0x${string}`],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      const receipt = await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      // Record transfer in history
      const metadata = parsedMetadata.get(tokenId) || {};
      const assetName = metadata.name || `IP Asset #${tokenId}`;
      const transferTimestamp = Date.now();
      
      const newTransfer: TransferRecord = {
        id: `transfer-${tokenId}-${transferTimestamp}`,
        tokenId,
        from: account.address,
        to: recipient,
        timestamp: transferTimestamp,
        txHash: transaction.transactionHash,
        blockNumber: receipt.blockNumber,
        isGift: isGift,
        giftMessage: isGift ? giftMessage : undefined,
        assetName
      };
      setTransferHistory(prev => [newTransfer, ...prev]);
      
      // Add to activity history
      const transferDescription = isGift 
        ? `Gifted "${assetName}" to ${recipient.substring(0, 10)}...${recipient.substring(recipient.length - 8)}${giftMessage ? ` with message: "${giftMessage}"` : ''}`
        : `Transferred "${assetName}" from ${account.address.substring(0, 10)}...${account.address.substring(account.address.length - 8)} to ${recipient.substring(0, 10)}...${recipient.substring(recipient.length - 8)}`;
      
      const newActivity: Activity = {
        id: `transfer-${tokenId}-${transferTimestamp}`,
        type: 'transfer',
        timestamp: transferTimestamp,
        assetId: tokenId,
        assetName,
        description: transferDescription,
        txHash: transaction.transactionHash,
        blockNumber: receipt.blockNumber,
        actor: account.address
      };
      setActivities(prev => [newActivity, ...prev]);
      
      // Reset form
      setTransferForm({
        tokenId: '',
        recipient: '',
        isGift: false,
        giftMessage: ''
      });

      const successMessage = isGift
        ? `IP asset #${tokenId} "${assetName}" has been gifted to ${recipient.substring(0, 10)}...${recipient.substring(recipient.length - 8)}`
        : `IP asset #${tokenId} "${assetName}" has been transferred to ${recipient.substring(0, 10)}...${recipient.substring(recipient.length - 8)}`;
      
      notifySuccess('Transfer Successful', successMessage);
      await loadContractData();
    } catch (error: any) {
      console.error("Error transferring IP:", error);
      const errorMessage = error?.message || error?.shortMessage || error?.cause?.message || "Failed to transfer IP asset";
      
      if (errorMessage.includes("Cannot transfer IP with active disputes") || errorMessage.includes("active disputes")) {
        notifyError('Active Disputes', 'This IP asset has active disputes. Please resolve them before transferring.');
      } else if (errorMessage.includes("Not the owner")) {
        notifyError('Not Owner', 'You are not the owner of this IP asset.');
      } else if (errorMessage.includes("Token does not exist")) {
        notifyError('Token Not Found', 'IP asset does not exist.');
      } else {
        notifyError('Transfer Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const resolveDisputeWithoutArbitrators = async (disputeId: number) => {
    if (!account?.address) {
      notifyError("Wallet Not Connected", "Please connect your wallet");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Resolving Dispute', 'Resolving dispute without arbitrators...');

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "resolveDisputeWithoutArbitrators",
        params: [BigInt(disputeId)],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Dispute Resolved', 'Dispute has been auto-rejected due to no arbitrators available.');
      await loadArbitrationData();
    } catch (error: any) {
      console.error("Error resolving dispute:", error);
      const errorMessage = error?.message || error?.shortMessage || error?.cause?.message || "Failed to resolve dispute";
      
      // Check for specific error messages
      if (errorMessage.includes("Only the dispute author can resolve") || errorMessage.includes("dispute author")) {
        notifyError('Authorization Failed', 'Only the person who raised the dispute can resolve it when no arbitrators are available.');
      } else if (errorMessage.includes("Deadline not passed")) {
        notifyError('Deadline Not Passed', 'The 7-day deadline has not yet passed. Please wait until after the deadline.');
      } else if (errorMessage.includes("Arbitrators already assigned")) {
        notifyError('Arbitrators Assigned', 'This dispute already has arbitrators assigned. Use the normal arbitration process.');
      } else {
        notifyError('Resolution Failed', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const submitArbitrationDecision = async (disputeId: number) => {
    if (!account?.address || !arbitrationResolution.trim()) {
      notifyError("Invalid Input", "Please enter a resolution statement");
      return;
    }

    try {
      setLoading(true);
      notifyInfo('Submitting Decision', 'Submitting arbitration decision...');

      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      const preparedCall = await prepareContractCall({
        contract,
        method: "submitArbitrationDecision",
        params: [BigInt(disputeId), arbitrationDecision, arbitrationResolution],
      });

      const transaction = await sendTransaction({
        transaction: preparedCall,
        account: account,
      });

      await waitForReceipt({
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        transactionHash: transaction.transactionHash,
      });

      notifySuccess('Decision Submitted', 'Your arbitration decision has been submitted!');
      setArbitrationResolution("");
      await loadArbitrationData();
      await loadContractData();
    } catch (error: any) {
      console.error("Error submitting decision:", error);
      notifyError('Submission Failed', error?.message || "Failed to submit arbitration decision");
    } finally {
      setLoading(false);
    }
  };

  const loadArbitrationData = async () => {
    if (!account?.address) return;

    try {
      const contract = getContract({
        abi: SEAR_ABI,
        client: thirdwebClient,
        chain: defineChain(mantleTestnet.id),
        address: CONTRACT_ADDRESS_JSON["ModredIPModule#ModredIP"],
      });

      // Load minimum stake with error handling
      try {
        const minStake = await readContract({
          contract,
          method: "MIN_ARBITRATOR_STAKE",
          params: [],
        });
        setMinArbitratorStake(formatEther(minStake));
        console.log("✅ Loaded MIN_ARBITRATOR_STAKE:", formatEther(minStake));
      } catch (error: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = error?.message || error?.shortMessage || String(error || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'MIN_ARBITRATOR_STAKE' not available. Using default value.");
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading MIN_ARBITRATOR_STAKE:", errorMessage);
        }
        // Set a default minimum stake (e.g., 0.1 ETH)
        setMinArbitratorStake("0.1");
      }

      // Load active arbitrator count with error handling
      try {
        const activeCount = await readContract({
          contract,
          method: "getActiveArbitratorsCount",
          params: [],
        });
        setActiveArbitratorsCount(Number(activeCount));
        console.log("✅ Loaded active arbitrators count:", Number(activeCount));
      } catch (error: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = error?.message || error?.shortMessage || String(error || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'getActiveArbitratorsCount' not available. Using default value.");
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading getActiveArbitratorsCount:", errorMessage);
        }
        setActiveArbitratorsCount(0);
      }

      // Load all arbitrators with error handling
      let arbitratorAddresses: readonly `0x${string}`[] = [];
      try {
        const result = await readContract({
          contract,
          method: "getAllArbitrators",
          params: [],
        });
        // Type assertion: readContract returns address[] which we cast to 0x${string}[]
        // This is safe because all Ethereum addresses start with 0x
        arbitratorAddresses = result as readonly `0x${string}`[];
        // Convert to mutable string array for state (string[] is compatible)
        setAllArbitrators(Array.from(arbitratorAddresses));
        console.log("✅ Loaded arbitrators:", arbitratorAddresses.length);
      } catch (error: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = error?.message || error?.shortMessage || String(error || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'getAllArbitrators' not available. Using empty array.");
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading getAllArbitrators:", errorMessage);
        }
        setAllArbitrators([]);
      }

      // Load arbitrator details
      const arbitratorDetails = new Map<string, any>();
      for (const addr of arbitratorAddresses) {
        try {
          const details = await readContract({
            contract,
            method: "getArbitrator",
            params: [addr],
          });
          
          // Try to get active disputes count from contract function
          let activeDisputes = 0;
          try {
            const activeDisputesCount = await readContract({
              contract,
              method: "getArbitratorActiveDisputes",
              params: [addr],
            });
            activeDisputes = Number(activeDisputesCount);
          } catch (e: any) {
            // Function doesn't exist or reverts - we'll calculate it manually below
            const errorMsg = e?.message || e?.shortMessage || String(e || '');
            const errorCode = e?.code;
            const isExpectedError = 
              errorMsg.includes("zero data") || 
              errorMsg.includes("Cannot decode") ||
              errorMsg.includes("AbiDecodingZeroDataError") ||
              errorMsg.includes("execution reverted") ||
              errorCode === 3;
            
            if (!isExpectedError) {
              console.warn(`⚠️ Unexpected error loading active disputes for ${addr}:`, errorMsg);
            }
            // Will calculate manually below
            activeDisputes = -1; // Use -1 as marker to calculate manually
          }
          
          arbitratorDetails.set(addr, {
            arbitrator: details[0],
            stake: details[1],
            reputation: details[2],
            totalCases: details[3],
            successfulCases: details[4],
            isActive: details[5],
            registrationDate: details[6],
            activeDisputes: activeDisputes, // Will be updated below if -1
          });
        } catch (e: any) {
          // Silently handle zero data errors
          const errorMsg = e?.message || e?.shortMessage || String(e || '');
          const isZeroDataError = 
            errorMsg.includes("zero data") || 
            errorMsg.includes("Cannot decode") ||
            errorMsg.includes("AbiDecodingZeroDataError");
          
          if (!isZeroDataError) {
            console.error(`Error loading arbitrator ${addr}:`, e);
          }
        }
      }
      setArbitratorsMap(arbitratorDetails);

      // Load all disputes with error handling
      let nextDisputeIdNum = 1;
      try {
        const nextDisputeId = await readContract({
          contract,
          method: "nextDisputeId",
          params: [],
        });
        nextDisputeIdNum = Number(nextDisputeId);
        console.log("✅ Loaded nextDisputeId:", nextDisputeIdNum);
      } catch (error: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = error?.message || error?.shortMessage || String(error || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'nextDisputeId' not available. Using default value.");
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading nextDisputeId:", errorMessage);
        }
        // Use default value of 1 (no disputes registered yet)
        nextDisputeIdNum = 1;
      }

      const disputesData = new Map<number, any>();
      for (let i = 1; i < nextDisputeIdNum; i++) {
        try {
          const dispute = await readContract({
            contract,
            method: "getDispute",
            params: [BigInt(i)],
          });
          disputesData.set(i, {
            disputeId: Number(dispute[0]),
            tokenId: Number(dispute[1]),
            disputer: dispute[2],
            reason: dispute[3],
            timestamp: dispute[4],
            isResolved: dispute[5],
            arbitrationId: Number(dispute[6]),
          });
        } catch (e) {
          // Dispute doesn't exist, skip
          console.error(`Error loading dispute ${i}:`, e);
        }
      }
      setDisputesMap(disputesData);

      // Load arbitration details for all disputes (both resolved and unresolved)
      // We need this to calculate active disputes per arbitrator
      const arbitrationsData = new Map<number, any>();
      for (const [, dispute] of disputesData.entries()) {
        // Load arbitration if it exists (disputes with assigned arbitrators have arbitrationId > 0)
        if (dispute.arbitrationId > 0) {
          try {
            const arbitration = await readContract({
              contract,
              method: "getArbitration",
              params: [BigInt(dispute.arbitrationId)],
            });
            arbitrationsData.set(dispute.arbitrationId, {
              arbitrationId: Number(arbitration[0]),
              disputeId: Number(arbitration[1]),
              arbitrators: arbitration[2],
              votesFor: Number(arbitration[3]),
              votesAgainst: Number(arbitration[4]),
              deadline: arbitration[5],
              isResolved: arbitration[6],
              resolution: arbitration[7],
              threeUpholdVotesTimestamp: arbitration[8],
            });
          } catch (e) {
            // Silently handle errors - arbitration might not exist yet
            console.log(`ℹ️ Arbitration ${dispute.arbitrationId} not available yet`);
          }
        }
      }
      setArbitrationsMap(arbitrationsData);

      // Calculate active disputes per arbitrator manually (workaround when getArbitratorActiveDisputes doesn't work)
      // This counts unresolved disputes where the arbitrator is assigned
      for (const [addr, arbitratorInfo] of arbitratorDetails.entries()) {
        if (arbitratorInfo.activeDisputes === -1) {
          // Calculate manually by counting unresolved disputes where this arbitrator is assigned
          let count = 0;
          for (const [, dispute] of disputesData.entries()) {
            if (!dispute.isResolved && dispute.arbitrationId > 0) {
              const arbitration = arbitrationsData.get(dispute.arbitrationId);
              if (arbitration && arbitration.arbitrators) {
                // Check if this arbitrator is in the arbitrators list
                const isAssigned = arbitration.arbitrators.some(
                  (arbAddr: string) => arbAddr.toLowerCase() === addr.toLowerCase()
                );
                if (isAssigned && !arbitration.isResolved) {
                  count++;
                }
              }
            }
          }
          arbitratorInfo.activeDisputes = count;
          if (count > 0) {
            console.log(`✅ Calculated ${count} active dispute(s) for arbitrator ${addr.substring(0, 10)}...`);
          }
        }
      }

      // Load contract owner with error handling
      try {
        const ownerAddress = await readContract({
          contract,
          method: "owner",
          params: [],
        });
        setIsOwner(account?.address?.toLowerCase() === ownerAddress.toLowerCase());
        console.log("✅ Loaded contract owner:", ownerAddress);
      } catch (e: any) {
        // Check if it's a zero data error (expected when function doesn't exist or contract not fully deployed)
        const errorMessage = e?.message || e?.shortMessage || String(e || '');
        const isZeroDataError = 
          errorMessage.includes("zero data") || 
          errorMessage.includes("Cannot decode") ||
          errorMessage.includes("AbiDecodingZeroDataError");
        
        if (isZeroDataError) {
          // Silently handle zero data errors - this is expected for new contracts
          console.log("ℹ️ Contract function 'owner' not available. Assuming user is not the owner.");
          setIsOwner(false); // Default to false if we can't determine
        } else {
          // Log other errors as warnings
          console.warn("⚠️ Error loading contract owner:", errorMessage);
          setIsOwner(false); // Default to false on error
        }
      }
    } catch (error: any) {
      // Only log unexpected errors, not zero data errors
      const errorMessage = error?.message || error?.shortMessage || String(error || '');
      const isZeroDataError = 
        errorMessage.includes("zero data") || 
        errorMessage.includes("Cannot decode") ||
        errorMessage.includes("AbiDecodingZeroDataError");
      
      if (!isZeroDataError) {
      console.error("Error loading arbitration data:", error);
      } else {
        console.log("ℹ️ Some arbitration contract functions returned zero data (expected for new contracts). Continuing with defaults.");
      }
    }
  };

  // Load arbitration data on mount
  useEffect(() => {
    if (account?.address) {
      loadArbitrationData();
    }
  }, [account?.address]);

  return (
    <div className="app">
      {/* Toast Notifications */}
      <NotificationToasts />
      
      {/* Modern Header */}
      <header className="header">
        <div className="header-container">
          <div className="header-logo">
            <img src="/modred.webp" alt="Sear" className="logo-image" />
            <h1>Sear</h1>
          </div>
          <div className="header-actions">
            <div className={`status-indicator ${backendStatus ? 'connected' : 'disconnected'}`}>
              <span>{backendStatus ? '🟢' : '🔴'}</span>
              <span>Backend {backendStatus ? 'Connected' : 'Disconnected'}</span>
              <button onClick={checkBackendStatus} className="refresh-btn">🔄</button>
            </div>
            <NotificationButton />
            <ConnectButton
              client={thirdwebClient}
              wallets={wallets}
              chain={defineChain(mantleTestnet.id)}
            />
          </div>
        </div>
      </header>

      

      {loading && (
        <div className="loading">
          <div className="loading-spinner"></div>
          <p>Processing your request...</p>
        </div>
      )}

              <div className="main-content">
          {/* Dashboard Navigation */}
          <div className="dashboard-nav">
            <button 
              className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              📊 Dashboard
            </button>
            <button 
              className={`nav-tab ${activeTab === 'register' ? 'active' : ''}`}
              onClick={() => setActiveTab('register')}
            >
              📝 Register IP
            </button>
            <button 
              className={`nav-tab ${activeTab === 'license' ? 'active' : ''}`}
              onClick={() => setActiveTab('license')}
            >
              🎫 License Management
            </button>
            <button 
              className={`nav-tab ${activeTab === 'revenue' ? 'active' : ''}`}
              onClick={() => setActiveTab('revenue')}
            >
              💰 Revenue & Analytics
            </button>
            <button 
              className={`nav-tab ${activeTab === 'arbitration' ? 'active' : ''}`}
              onClick={() => setActiveTab('arbitration')}
            >
              ⚖️ Arbitration
            </button>
            <button 
              className={`nav-tab ${activeTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveTab('activity')}
            >
              📜 Activity History
            </button>
            <button 
              className={`nav-tab ${activeTab === 'transfer' ? 'active' : ''}`}
              onClick={() => setActiveTab('transfer')}
            >
              🔄 Transfer & Gift
            </button>
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <IPPortfolio 
                assets={ipAssets}
                licenses={licenses}
                metadata={parsedMetadata}
                userAddress={account?.address}
                onTransferIP={(tokenId, recipient) => transferIP(tokenId, recipient, false, '')}
              />
            )}

            {/* Register IP Tab */}
            {activeTab === 'register' && (
              <section className="section section-wide">
                <div className="section-header">
                  <span className="section-icon">📝</span>
                  <h2 className="section-title">Register IP Asset</h2>
                      </div>
          
          <div className="form-grid">
            {/* File Upload */}
            <div 
              className="file-upload-area"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                type="file"
                id="ip-file-upload"
                className="file-upload-input"
                onChange={handleFileChange}
                accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp3,.wav,.mp4"
              />
              <div className="file-upload-content">
                <div className="file-upload-icon">📎</div>
                <div className="file-upload-text">
                  <strong>Click to upload</strong> or drag and drop
                </div>
                <div className="file-upload-hint">
                  PDF, DOC, TXT, JPG, PNG, GIF, MP3, WAV, MP4 (max 50MB)
                </div>
              </div>
            </div>

            {filePreview && (
              <div className="file-preview animate-slide-up">
                {filePreview.startsWith('data:image') ? (
                  <img 
                    src={filePreview} 
                    alt="File preview"
                    className="file-preview-image"
                  />
                ) : (
                  <div className="file-preview-image">📄</div>
                )}
                <div className="file-preview-info">
                  <div className="file-preview-name">{ipFile?.name}</div>
                  <div className="file-preview-size">
                    {ipFile ? `${(ipFile.size / 1024 / 1024).toFixed(2)} MB` : ''}
        </div>
                </div>
              </div>
            )}

            <button 
              className="btn btn-secondary btn-full"
              onClick={uploadToIPFS} 
              disabled={!ipFile || loading}
            >
              {loading ? '⏳ Uploading...' : '🚀 Upload to IPFS'}
            </button>
            {/* IP Details Form */}
            <div className="form-group">
              <label className="form-label">🔗 IP Hash (IPFS)</label>
              <input
                type="text"
                className="form-input"
                value={ipHash}
                onChange={(e) => setIpHash(e.target.value)}
                placeholder="IPFS hash will appear after upload"
                readOnly
              />
        </div>

            {ipHash && (
              <div className="media-preview animate-scale-in">
                <div className="media-container">
                  {ipFile && ipFile.type.startsWith('image/') ? (
                    <img 
                      src={getIPFSGatewayURL(ipHash)} 
                      alt="Uploaded media"
                      className="media-image"
                      onError={(e) => {
                        const imgElement = e.target as HTMLImageElement;
                        imgElement.style.display = 'none';
                        const fallback = imgElement.nextElementSibling as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className="media-fallback" style={{ display: ipFile?.type.startsWith('image/') ? 'none' : 'flex' }}>
                    <div className="media-fallback-icon">📄</div>
                    <p>Media Preview</p>
                    <a href={getIPFSGatewayURL(ipHash)} target="_blank" rel="noopener noreferrer" className="media-link">
                      🔗 View Media
                    </a>
        </div>
      </div>
              </div>
            )}

            <div className="form-group-row">
              <div className="form-group">
                <label className="form-label">📝 Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={ipName}
                  onChange={(e) => setIpName(e.target.value)}
                  placeholder="Enter a name for your IP asset"
                />
              </div>
              <div className="form-group">
                <label className="form-label">🔒 Security</label>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={isEncrypted}
                    onChange={(e) => setIsEncrypted(e.target.checked)}
                  />
                  <label className="checkbox-label">Encrypted Content</label>
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">📄 Description</label>
        <textarea
                className="form-input form-textarea"
                value={ipDescription}
                onChange={(e) => setIpDescription(e.target.value)}
                placeholder="Describe your IP asset"
                rows={3}
              />
            </div>

            <button 
              className="btn btn-primary btn-full"
              onClick={registerIP} 
              disabled={loading || !account?.address || !ipHash || !ipName.trim()}
            >
              {loading ? '⏳ Registering...' : '🚀 Register IP Asset'}
            </button>
          </div>
        </section>
            )}

            {/* License Management Tab */}
            {activeTab === 'license' && (
              <section className="section">
                <div className="section-header">
                  <span className="section-icon">🎫</span>
                  <h2 className="section-title">Mint License</h2>
                </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">🎯 Select IP Asset</label>
            <select
                className="form-select"
                value={selectedTokenId}
                onChange={(e) => setSelectedTokenId(Number(e.target.value))}
              >
                {Array.from(ipAssets.keys()).map((id) => {
                  const asset = ipAssets.get(id);
                  const metadata = parsedMetadata.get(id) || { name: "Unknown" };
                  return (
                    <option key={id} value={id}>
                      #{id} - {metadata.name || asset?.ipHash.substring(0, 10) || 'Unknown'}
                    </option>
                  );
                })}
            </select>
            </div>

            {/* License Template Selector */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                <label className="form-label" style={{ margin: 0, flex: 1 }}>📋 License Template</label>
                {selectedLicenseTemplate !== "custom" && (
                  <button
                    type="button"
                    onClick={() => applyLicenseTemplate(selectedLicenseTemplate)}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.875rem',
                      backgroundColor: 'var(--color-secondary, #6c757d)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--color-secondary-hover, #5a6268)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'var(--color-secondary, #6c757d)'}
                  >
                    🔄 Reset to Template
                  </button>
                )}
              </div>
              <select
                className="form-select"
                value={selectedLicenseTemplate}
                onChange={(e) => applyLicenseTemplate(e.target.value)}
              >
                {LICENSE_TEMPLATES.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.icon} {template.name}
                  </option>
                ))}
              </select>
              {selectedLicenseTemplate !== "custom" && (() => {
                const template = LICENSE_TEMPLATES.find(t => t.id === selectedLicenseTemplate);
                if (!template) return null;
                
                // Check if form values match template (to show customization indicator)
                const isCustomized = 
                  royaltyPercentage !== template.royaltyPercentage ||
                  licenseDuration !== template.duration ||
                  commercialUse !== template.commercialUse ||
                  commercialAttribution !== template.commercialAttribution ||
                  derivativesAllowed !== template.derivativesAllowed ||
                  derivativesAttribution !== template.derivativesAttribution ||
                  derivativesApproval !== template.derivativesApproval ||
                  derivativesReciprocal !== template.derivativesReciprocal;
                
                return (
                  <div style={{
                    marginTop: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: isCustomized 
                      ? 'var(--color-warning-bg, #fff3cd)' 
                      : 'var(--color-info-bg, #d1ecf1)',
                    border: `1px solid ${isCustomized 
                      ? 'var(--color-warning-border, #ffc107)' 
                      : 'var(--color-info-border, #0c5460)'}`,
                    borderRadius: '6px',
                    fontSize: '0.875rem',
                    color: isCustomized 
                      ? 'var(--color-warning-text, #856404)' 
                      : 'var(--color-info-text, #0c5460)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <strong>{template.icon} {template.name}</strong>
                      {isCustomized && (
                        <span style={{
                          fontSize: '0.75rem',
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'var(--color-warning, #ffc107)',
                          color: '#000',
                          borderRadius: '4px',
                          fontWeight: 'bold'
                        }}>
                          ✏️ Customized
                        </span>
                      )}
                    </div>
                    <div>{template.description}</div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', opacity: 0.9 }}>
                      💰 Royalty: {template.royaltyPercentage}% | 
                      ⏰ Duration: {formatDuration(template.duration)} | 
                      {template.commercialUse ? ' 💼 Commercial' : ' 🚫 Non-Commercial'} | 
                      {template.derivativesAllowed ? ' ✏️ Derivatives Allowed' : ' 🔒 No Derivatives'}
                    </div>
                  </div>
                );
              })()}
              <small className="form-hint">
                Select a predefined template or choose "Custom" to configure manually. Templates can be customized after selection.
              </small>
            </div>

            <div className="form-group-row">
              <div className="form-group">
                <label className="form-label">💰 Royalty (%)</label>
            <input
              type="number"
                  className="form-input"
                  value={royaltyPercentage}
                  onChange={(e) => setRoyaltyPercentage(Number(e.target.value))}
                  min="1"
                  max="100"
                  placeholder="10"
                />
              </div>
              <div className="form-group">
                <label className="form-label">⏰ Duration (seconds)</label>
                <input
                  type="number"
                  className="form-input"
                  value={licenseDuration}
                  onChange={(e) => setLicenseDuration(Number(e.target.value))}
                  min="3600"
                  placeholder="86400"
                />
              </div>
            </div>

            {/* License Terms */}
            <div className="form-group">
              <label className="form-label">⚙️ License Terms</label>
              <div className="form-grid">
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={commercialUse}
                    onChange={(e) => setCommercialUse(e.target.checked)}
                  />
                  <label className="checkbox-label">Commercial Use Allowed</label>
                </div>
                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={commercialAttribution}
                    onChange={(e) => setCommercialAttribution(e.target.checked)}
                  />
                  <label className="checkbox-label">Commercial Attribution</label>
                </div>

                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={derivativesAllowed}
                    onChange={(e) => setDerivativesAllowed(e.target.checked)}
                  />
                  <label className="checkbox-label">Derivatives Allowed</label>
                </div>

                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={derivativesAttribution}
                    onChange={(e) => setDerivativesAttribution(e.target.checked)}
                  />
                  <label className="checkbox-label">Derivatives Attribution</label>
                </div>

                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={derivativesApproval}
                    onChange={(e) => setDerivativesApproval(e.target.checked)}
                  />
                  <label className="checkbox-label">Derivatives Approval Required</label>
                </div>

                <div className="checkbox-group">
                  <input
                    type="checkbox"
                    className="checkbox-input"
                    checked={derivativesReciprocal}
                    onChange={(e) => setDerivativesReciprocal(e.target.checked)}
                  />
                  <label className="checkbox-label">Derivatives Reciprocal</label>
                </div>
              </div>
            </div>

            {/* Advanced Settings */}
            <details className="form-group">
              <summary className="form-label" style={{ cursor: 'pointer', fontWeight: 600 }}>
                🔧 Advanced Settings
              </summary>
              <div className="form-grid" style={{ marginTop: '1rem' }}>
                <div className="form-group-row">
                  <div className="form-group">
                    <label className="form-label">💵 Commercial Rev Share (%)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={commercialRevShare / 1000000}
                      onChange={(e) => setCommercialRevShare(Number(e.target.value) * 1000000)}
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="100"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">🏛️ Commercial Rev Ceiling</label>
                    <input
                      type="number"
                      className="form-input"
                      value={commercialRevCeiling}
                      onChange={(e) => setCommercialRevCeiling(Number(e.target.value))}
                      min="0"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">🔍 Commercializer Checker</label>
                  <input
                    type="text"
                    className="form-input"
                    value={commercializerChecker}
                    onChange={(e) => setCommercializerChecker(e.target.value)}
                    placeholder="0x0000000000000000000000000000000000000000"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">📊 Derivative Rev Ceiling</label>
                  <input
                    type="number"
                    className="form-input"
                    value={derivativeRevCeiling}
                    onChange={(e) => setDerivativeRevCeiling(Number(e.target.value))}
                    min="0"
                    placeholder="0"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">💱 License Currency</label>
                  <input
                    type="text"
                    className="form-input"
                    value={licenseCurrency}
                    onChange={(e) => setLicenseCurrency(e.target.value)}
                    placeholder="0x15140000000000000000000000000000000000000"
                  />
                </div>
              </div>
            </details>

            <button 
              className="btn btn-primary btn-full"
              onClick={mintLicense} 
              disabled={loading || !account?.address}
            >
              {loading ? '⏳ Minting...' : '🎫 Mint License'}
            </button>
          </div>
        </section>
            )}

            {/* Revenue & Analytics Tab */}
            {activeTab === 'revenue' && (
              <>
                {/* Pay Revenue */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">💳</span>
                    <h2 className="section-title">Pay Revenue</h2>
                  </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">🎯 Select IP Asset</label>
              <select
                className="form-select"
                value={paymentTokenId}
                onChange={(e) => setPaymentTokenId(Number(e.target.value))}
              >
                {Array.from(ipAssets.keys()).map((id) => {
                  const asset = ipAssets.get(id);
                  const metadata = parsedMetadata.get(id) || { name: "Unknown" };
  return (
                    <option key={id} value={id}>
                      #{id} - {metadata.name || asset?.ipHash.substring(0, 10) || 'Unknown'}
                    </option>
                  );
                })}
              </select>
            </div>
            
            <div className="form-group">
              <label className="form-label">💰 Amount (MNT)</label>
              <input
                type="number"
                className="form-input"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                min="0.001"
                step="0.001"
                placeholder="0.001"
            />
          </div>
            
            <button 
              className="btn btn-primary btn-full"
              onClick={payRevenue} 
              disabled={loading || !account?.address || !paymentAmount || parseFloat(paymentAmount) <= 0}
            >
              {loading ? '⏳ Processing...' : '💳 Pay Revenue'}
            </button>
          </div>
        </section>

        {/* Claim Royalties */}
        <section className="section">
          <div className="section-header">
            <span className="section-icon">🏆</span>
            <h2 className="section-title">Claim Royalties</h2>
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">🎯 Select IP Asset</label>
              <select
                className="form-select"
                value={claimTokenId}
                onChange={(e) => setClaimTokenId(Number(e.target.value))}
              >
                {Array.from(ipAssets.keys()).map((id) => {
                  const asset = ipAssets.get(id);
                  const metadata = parsedMetadata.get(id) || { name: "Unknown" };
                  return (
                    <option key={id} value={id}>
                      #{id} - {metadata.name || asset?.ipHash.substring(0, 10) || 'Unknown'}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Accumulated Royalties Display */}
            {account?.address && accumulatedRoyalties.has(claimTokenId) && (
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <div style={{
                  padding: '1rem',
                  backgroundColor: accumulatedRoyalties.get(claimTokenId)! > 0n
                    ? 'var(--color-success-bg, #d4edda)'
                    : 'var(--color-info-bg, #d1ecf1)',
                  border: `1px solid ${accumulatedRoyalties.get(claimTokenId)! > 0n
                    ? 'var(--color-success-border, #28a745)'
                    : 'var(--color-info-border, #0c5460)'}`,
                  borderRadius: '8px',
                  marginTop: '0.5rem'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                  }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '1rem',
                      fontWeight: 600,
                      color: accumulatedRoyalties.get(claimTokenId)! > 0n
                        ? 'var(--color-success-text, #155724)'
                        : 'var(--color-info-text, #0c5460)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      💰 Accumulated Royalties
                    </h3>
                    <span style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: accumulatedRoyalties.get(claimTokenId)! > 0n
                        ? 'var(--color-success-text, #155724)'
                        : 'var(--color-info-text, #0c5460)'
                    }}>
                      {formatEther(accumulatedRoyalties.get(claimTokenId) || 0n)} MNT
                    </span>
                  </div>
                  
                  {accumulatedRoyalties.get(claimTokenId)! > 0n ? (
                    <div style={{
                      fontSize: '0.875rem',
                      color: 'var(--color-success-text, #155724)',
                      opacity: 0.9
                    }}>
                      ✅ You have claimable royalties for this IP asset. Click "Claim Royalties" to withdraw.
                    </div>
                  ) : (
                    <div style={{
                      fontSize: '0.875rem',
                      color: '#0c5460',
                      fontWeight: 500,
                      opacity: 1
                    }}>
                      ℹ️ No accumulated royalties available for this IP asset. Royalties accumulate when revenue is paid to this IP.
                    </div>
                  )}

                  {/* Show license details if user has a license */}
                  {(() => {
                    const userLicenses = Array.from(licenses.entries())
                      .filter(([_, license]) => 
                        Number(license.tokenId) === claimTokenId &&
                        license.licensee.toLowerCase() === account?.address.toLowerCase()
                      );
                    
                    if (userLicenses.length > 0) {
                      return (
                        <div style={{
                          marginTop: '0.75rem',
                          paddingTop: '0.75rem',
                          borderTop: '1px solid rgba(0,0,0,0.1)'
                        }}>
                          <strong style={{ 
                            fontSize: '0.8rem',
                            color: accumulatedRoyalties.get(claimTokenId)! > 0n
                              ? 'var(--color-success-text, #155724)'
                              : 'var(--color-info-text, #0c5460)'
                          }}>Your Licenses:</strong>
                          {userLicenses.map(([licenseId, license]) => (
                            <div key={licenseId} style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem',
                              backgroundColor: 'rgba(255, 255, 255, 0.3)',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              color: accumulatedRoyalties.get(claimTokenId)! > 0n
                                ? 'var(--color-success-text, #155724)'
                                : 'var(--color-info-text, #0c5460)'
                            }}>
                              <div style={{ fontWeight: 500 }}>🎫 License #{licenseId}</div>
                              <div style={{ 
                                opacity: 0.9, 
                                marginTop: '0.25rem',
                                color: accumulatedRoyalties.get(claimTokenId)! > 0n
                                  ? 'var(--color-success-text, #155724)'
                                  : 'var(--color-info-text, #0c5460)'
                              }}>
                                Royalty Rate: {Number(license.royaltyPercentage) / 100}% | 
                                {license.isActive ? ' ✅ Active' : ' ❌ Inactive'}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )}
            
            <button 
              className="btn btn-primary btn-full"
              onClick={claimRoyalties} 
              disabled={loading || !account?.address || !accumulatedRoyalties.get(claimTokenId) || accumulatedRoyalties.get(claimTokenId)! === 0n}
            >
              {loading ? '⏳ Claiming...' : '🏆 Claim Royalties'}
            </button>
                </div>
                </section>
              </>
            )}

            {/* Arbitration Tab */}
            {activeTab === 'arbitration' && (
              <>
                {/* Register as Arbitrator */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">⚖️</span>
                    <h2 className="section-title">Register as Arbitrator</h2>
                  </div>
          
                  <div className="form-grid">
                    {(() => {
                      const userArbitrator = account?.address ? arbitratorsMap.get(account.address) : null;
                      const isUserArbitrator = userArbitrator && userArbitrator.arbitrator !== '0x0000000000000000000000000000000000000000';
                      const userStake = userArbitrator ? userArbitrator.stake : 0n;
                      const userActiveDisputes = userArbitrator?.activeDisputes || 0;
                      const userIsActive = userArbitrator?.isActive || false;

                      if (isUserArbitrator && userIsActive && userStake > 0n) {
                        return (
                          <>
                            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                              <div style={{
                                padding: '1rem',
                                backgroundColor: 'var(--color-info-bg, #d1ecf1)',
                                border: '1px solid var(--color-info-border, #0c5460)',
                                borderRadius: '8px',
                                marginBottom: '1rem',
                                color: 'var(--color-info-text, #0c5460)'
                              }}>
                                <strong>ℹ️ Your Arbitrator Status:</strong>
                                <div style={{ marginTop: '0.5rem' }}>
                                  <div>💰 Stake: {formatEther(userStake)} MNT</div>
                                  <div>⚖️ Active Disputes: {userActiveDisputes}</div>
                                  <div>✅ Status: Active</div>
                                  {userActiveDisputes > 0 && (
                                    <div style={{ marginTop: '0.5rem', color: 'var(--color-warning, #ffc107)', fontWeight: 'bold' }}>
                                      ⚠️ You cannot unstake while assigned to active disputes.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button 
                              className="btn btn-danger btn-full"
                              onClick={unstakeArbitrator} 
                              disabled={loading || !account?.address || userActiveDisputes > 0}
                            >
                              {loading ? '⏳ Unstaking...' : `💸 Unstake (${formatEther(userStake)} MNT)`}
                            </button>
                          </>
                        );
                      } else {
                        return (
                          <>
                    <div className="form-group">
                      <label className="form-label">💰 Minimum Stake (MNT)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={minArbitratorStake}
                        onChange={(e) => setMinArbitratorStake(e.target.value)}
                        min="0.000000001"
                        step="0.000000001"
                        placeholder="0.000000001"
                        readOnly
                      />
                      <small className="form-hint">Minimum stake required to become an arbitrator</small>
                    </div>
            
                    <button 
                      className="btn btn-primary btn-full"
                      onClick={registerArbitrator} 
                      disabled={loading || !account?.address}
                    >
                      {loading ? '⏳ Registering...' : '⚖️ Register as Arbitrator'}
                    </button>
                          </>
                        );
                      }
                    })()}
                  </div>
                </section>

                {/* Raise Dispute */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">🚨</span>
                    <h2 className="section-title">Raise Dispute</h2>
                  </div>
          
                  <div className="form-grid">
                    {activeArbitratorsCount === 0 && (
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ 
                          padding: '1rem', 
                          backgroundColor: 'var(--color-warning-bg, #fff3cd)', 
                          border: '1px solid var(--color-warning-border, #ffc107)',
                          borderRadius: '8px',
                          marginBottom: '1rem'
                        }}>
                          <strong>⚠️ Warning:</strong> No active arbitrators are currently registered. 
                          If you raise a dispute, it will be automatically rejected after 7 days if no arbitrators are assigned.
                          Consider registering as an arbitrator first to ensure disputes can be properly reviewed.
                        </div>
                      </div>
                    )}
                    {activeArbitratorsCount > 0 && activeArbitratorsCount < 3 && (
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <div style={{ 
                          padding: '1rem', 
                          backgroundColor: 'var(--color-info-bg, #d1ecf1)', 
                          border: '1px solid var(--color-info-border, #0c5460)',
                          borderRadius: '8px',
                          marginBottom: '1rem',
                          color: 'var(--color-info-text, #0c5460)'
                        }}>
                          <strong>ℹ️ Info:</strong> Only {activeArbitratorsCount} active arbitrator{activeArbitratorsCount !== 1 ? 's' : ''} available 
                          (recommended: 3). Disputes can still be processed with fewer arbitrators.
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">🎯 Select IP Asset</label>
                      <select
                        className="form-select"
                        value={disputeTokenId}
                        onChange={(e) => setDisputeTokenId(Number(e.target.value))}
                      >
                        {Array.from(ipAssets.keys()).map((id) => {
                          const asset = ipAssets.get(id);
                          const metadata = parsedMetadata.get(id) || { name: "Unknown" };
                          return (
                            <option key={id} value={id}>
                              #{id} - {metadata.name || asset?.ipHash.substring(0, 10) || 'Unknown'}
                            </option>
                          );
                        })}
                      </select>
                    </div>
            
                    <div className="form-group">
                      <label className="form-label">📝 Dispute Reason</label>
                      <textarea
                        className="form-input"
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        rows={4}
                        placeholder="Explain why you are disputing this IP asset..."
                      />
                    </div>
            
                    <button 
                      className="btn btn-primary btn-full"
                      onClick={raiseDispute} 
                      disabled={loading || !account?.address || !disputeReason.trim()}
                    >
                      {loading ? '⏳ Submitting...' : '🚨 Raise Dispute'}
                    </button>
                  </div>
                </section>

                {/* Assign Arbitrators */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">👥</span>
                    <h2 className="section-title">Assign Arbitrators to Dispute</h2>
                  </div>
          
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">🎯 Dispute ID</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Enter dispute ID"
                        min="1"
                        value={assignDisputeId || ""}
                        onChange={(e) => {
                          setAssignDisputeId(Number(e.target.value) || 0);
                          setSelectedArbitrators([]); // Reset selection when dispute changes
                        }}
                      />
                      <small className="form-hint">
                        Select 1-3 active arbitrators to assign to this dispute. 
                        You can select from the list of registered arbitrators below.
                      </small>
                    </div>
            
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label className="form-label">⚖️ Select Arbitrators ({selectedArbitrators.length}/3 selected)</label>
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', 
                        gap: '0.75rem',
                        marginTop: '0.5rem'
                      }}>
                        {allArbitrators
                          .filter(addr => {
                            const arb = arbitratorsMap.get(addr);
                            return arb && arb.isActive;
                          })
                          .map((addr) => {
                            const arb = arbitratorsMap.get(addr);
                            if (!arb) return null;
                            const isSelected = selectedArbitrators.includes(addr);
                            
                            return (
                              <div
                                key={addr}
                                onClick={() => {
                                  if (isSelected) {
                                    setSelectedArbitrators(selectedArbitrators.filter(a => a !== addr));
                                  } else {
                                    if (selectedArbitrators.length < 3) {
                                      // Warn if arbitrator has high workload
                                      if ((arb.activeDisputes || 0) >= 5) {
                                        notifyWarning('High Workload', `This arbitrator already has ${arb.activeDisputes} active disputes. Consider selecting someone with less workload.`);
                                      }
                                      setSelectedArbitrators([...selectedArbitrators, addr]);
                                    } else {
                                      notifyWarning('Maximum Reached', 'You can only select up to 3 arbitrators');
                                    }
                                  }
                                }}
                                style={{
                                  padding: '1rem',
                                  border: `2px solid ${isSelected ? 'var(--color-primary, #007bff)' : 
                                    (arb.activeDisputes || 0) >= 5 ? 'var(--color-danger, #dc3545)' :
                                    (arb.activeDisputes || 0) >= 3 ? 'var(--color-warning, #ffc107)' :
                                    'var(--color-border, #ddd)'}`,
                                  borderRadius: '8px',
                                  cursor: 'pointer',
                                  backgroundColor: isSelected ? 'var(--color-primary-bg, rgba(0, 123, 255, 0.1))' : 
                                    (arb.activeDisputes || 0) >= 5 ? 'rgba(220, 53, 69, 0.1)' :
                                    (arb.activeDisputes || 0) >= 3 ? 'rgba(255, 193, 7, 0.1)' :
                                    'transparent',
                                  transition: 'all 0.2s',
                                  opacity: (arb.activeDisputes || 0) >= 10 ? 0.6 : 1
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    style={{ cursor: 'pointer' }}
                                  />
                                  <strong style={{ fontSize: '0.9rem' }}>
                                    {addr.substring(0, 10)}...{addr.substring(addr.length - 8)}
                                  </strong>
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                  <div>⭐ Reputation: {Number(arb.reputation)}</div>
                                  <div>📊 Total Cases: {Number(arb.totalCases)}</div>
                                  <div style={{ 
                                    color: (arb.activeDisputes || 0) >= 5 ? 'var(--color-danger, #dc3545)' : 
                                           (arb.activeDisputes || 0) >= 3 ? 'var(--color-warning, #ffc107)' : 
                                           'var(--color-text-secondary)',
                                    fontWeight: (arb.activeDisputes || 0) >= 3 ? 'bold' : 'normal'
                                  }}>
                                    ⚖️ Active Disputes: {arb.activeDisputes || 0}
                                    {(arb.activeDisputes || 0) >= 5 && ' ⚠️ (High Workload)'}
                                    {(arb.activeDisputes || 0) >= 3 && (arb.activeDisputes || 0) < 5 && ' ⚡ (Moderate)'}
                                  </div>
                                  <div>💰 Stake: {formatEther(arb.stake)} MNT</div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                      {allArbitrators.filter(addr => {
                        const arb = arbitratorsMap.get(addr);
                        return arb && arb.isActive;
                      }).length === 0 && (
                        <div style={{ 
                          padding: '1rem', 
                          textAlign: 'center', 
                          color: 'var(--color-text-tertiary)',
                          marginTop: '0.5rem'
                        }}>
                          No active arbitrators available. Register as an arbitrator first.
                        </div>
                      )}
                    </div>
            
                    <button 
                      className="btn btn-primary btn-full"
                      onClick={() => {
                        if (assignDisputeId > 0 && selectedArbitrators.length > 0) {
                          assignArbitrators(assignDisputeId, selectedArbitrators);
                        } else {
                          notifyError("Invalid Input", "Please select a dispute ID and at least one arbitrator");
                        }
                      }}
                      disabled={loading || !account?.address || assignDisputeId <= 0 || selectedArbitrators.length === 0}
                    >
                      {loading ? '⏳ Assigning...' : `👥 Assign ${selectedArbitrators.length} Arbitrator${selectedArbitrators.length !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </section>

                {/* Submit Arbitration Decision */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">⚖️</span>
                    <h2 className="section-title">Submit Arbitration Decision</h2>
                  </div>
          
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">🎯 Dispute ID</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Enter dispute ID"
                        min="1"
                        value={arbitrationDisputeId || ""}
                        onChange={(e) => setArbitrationDisputeId(Number(e.target.value) || 0)}
                      />
                    </div>
            
                    <div className="form-group">
                      <label className="form-label">📊 Decision</label>
                      <select
                        className="form-select"
                        value={arbitrationDecision ? "true" : "false"}
                        onChange={(e) => setArbitrationDecision(e.target.value === "true")}
                      >
                        <option value="true">✅ Uphold Dispute</option>
                        <option value="false">❌ Reject Dispute</option>
                      </select>
                    </div>
            
                    <div className="form-group">
                      <label className="form-label">📝 Resolution Statement</label>
                      <textarea
                        className="form-input"
                        value={arbitrationResolution}
                        onChange={(e) => setArbitrationResolution(e.target.value)}
                        rows={4}
                        placeholder="Explain your decision..."
                      />
                    </div>
            
                    <button 
                      className="btn btn-primary btn-full"
                      onClick={() => {
                        if (arbitrationDisputeId > 0) {
                          submitArbitrationDecision(arbitrationDisputeId);
                        } else {
                          notifyError("Invalid Input", "Please enter a dispute ID");
                        }
                      }}
                      disabled={loading || !account?.address || !arbitrationResolution.trim() || arbitrationDisputeId <= 0}
                    >
                      {loading ? '⏳ Submitting...' : '⚖️ Submit Decision'}
                    </button>
                  </div>
                </section>

                {/* Check and Resolve After 24h */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">⏱️</span>
                    <h2 className="section-title">Resolve After 24h Wait Period</h2>
                  </div>
          
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">🎯 Dispute ID</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Enter dispute ID"
                        min="1"
                        value={resolveDisputeId || ""}
                        onChange={(e) => setResolveDisputeId(Number(e.target.value) || 0)}
                      />
                      <small className="form-hint">
                        Disputes automatically resolve when 3+ uphold votes exist and 24 hours have passed since the 3rd uphold vote. 
                        This button manually triggers resolution if needed (e.g., if auto-resolution didn't trigger yet).
                      </small>
                    </div>
            
                    {!isOwner && (
                      <div style={{ 
                        padding: '1rem', 
                        backgroundColor: 'var(--color-warning-bg, rgba(255, 193, 7, 0.1))', 
                        borderRadius: '8px',
                        color: 'var(--color-warning, #ffc107)',
                        marginBottom: '1rem'
                      }}>
                        ⚠️ Only the contract owner can manually trigger resolution.
                      </div>
                    )}
                    <button 
                      className="btn btn-primary btn-full"
                      onClick={() => checkAndResolveArbitration(resolveDisputeId)}
                      disabled={loading || !account?.address || resolveDisputeId <= 0 || !isOwner}
                    >
                      {loading ? '⏳ Checking...' : '✅ Check & Resolve After 24h'}
                    </button>
                  </div>
                </section>

                {/* Resolve Dispute Without Arbitrators */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">⏰</span>
                    <h2 className="section-title">Resolve Dispute (No Arbitrators)</h2>
                  </div>
          
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">🎯 Dispute ID</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Enter dispute ID"
                        min="1"
                        value={resolveDisputeId || ""}
                        onChange={(e) => setResolveDisputeId(Number(e.target.value) || 0)}
                      />
                      <small className="form-hint">
                        Only the dispute author can resolve disputes with no arbitrators after the deadline has passed. 
                        The dispute will be automatically rejected.
                      </small>
                    </div>
            
                    <button 
                      className="btn btn-secondary btn-full"
                      onClick={() => resolveDisputeWithoutArbitrators(resolveDisputeId)}
                      disabled={loading || !account?.address || resolveDisputeId <= 0}
                    >
                      {loading ? '⏳ Resolving...' : '⏰ Auto-Resolve Dispute'}
                    </button>
                  </div>
                </section>

                {/* Disputes List */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">📋</span>
                    <h2 className="section-title">
                      All Disputes
                      {(() => {
                        const filtered = filterAndSortDisputes(disputesMap);
                        return filtered.length !== disputesMap.size ? ` (${filtered.length} of ${disputesMap.size})` : ` (${disputesMap.size} Total)`;
                      })()}
                    </h2>
                  </div>
          
                  <div className="grid grid-2">
                    {(() => {
                      const filtered = filterAndSortDisputes(disputesMap);
                      return filtered.length > 0 ? (
                      filtered.map(([id, dispute]) => {
                        const metadata = parsedMetadata.get(dispute.tokenId) || { name: "Unknown" };
                        const disputeDate = new Date(Number(dispute.timestamp) * 1000).toLocaleDateString();
                        
                        return (
                          <div key={id} className="card">
                            <div className="card-header">
                              <h3 className="card-title">Dispute #{dispute.disputeId}</h3>
                              <span className={`badge ${dispute.isResolved ? 'badge-success' : 'badge-warning'}`}>
                                {dispute.isResolved ? '✅ Resolved' : '⏳ Pending'}
                              </span>
                            </div>
                            <div className="card-body">
                              <div className="card-field">
                                <span className="card-field-label">Dispute ID</span>
                                <span className="card-field-value">#{dispute.disputeId}</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">IP Asset</span>
                                <span className="card-field-value">
                                  #{dispute.tokenId} - {metadata.name || 'Unknown'}
                                </span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Disputer</span>
                                <span className="card-field-value address">
                                  {dispute.disputer.substring(0, 10)}...{dispute.disputer.substring(dispute.disputer.length - 8)}
                                </span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Reason</span>
                                <span className="card-field-value" style={{ wordBreak: 'break-word' }}>
                                  {dispute.reason.length > 100 
                                    ? `${dispute.reason.substring(0, 100)}...` 
                                    : dispute.reason}
                                </span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Date</span>
                                <span className="card-field-value">{disputeDate}</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Arbitration ID</span>
                                <span className="card-field-value">#{dispute.arbitrationId}</span>
                              </div>
                              {dispute.isResolved && arbitrationsMap.has(dispute.arbitrationId) && (() => {
                                const arbitration = arbitrationsMap.get(dispute.arbitrationId);
                                const isUpheld = arbitration.votesFor > arbitration.votesAgainst;
                                return (
                                  <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'var(--color-bg-secondary, #f5f5f5)', borderRadius: '8px' }}>
                                    <div className="card-field" style={{ marginBottom: '0.5rem' }}>
                                      <span className="card-field-label">Resolution Outcome</span>
                                      <span className={`card-field-value ${isUpheld ? 'text-success' : 'text-danger'}`} style={{ fontWeight: 'bold' }}>
                                        {isUpheld ? '✅ Dispute Upheld' : '❌ Dispute Rejected'}
                                      </span>
                                    </div>
                                    <div className="card-field">
                                      <span className="card-field-label">Votes</span>
                                      <span className="card-field-value">
                                        {arbitration.votesFor} For / {arbitration.votesAgainst} Against
                                      </span>
                                    </div>
                                    {arbitration.resolution && arbitration.resolution.trim() && (
                                      <div className="card-field" style={{ marginTop: '0.5rem' }}>
                                        <span className="card-field-label">Resolution Statement</span>
                                        <span className="card-field-value" style={{ wordBreak: 'break-word', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                          {arbitration.resolution}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                              {!dispute.isResolved && (
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => {
                                      setArbitrationDisputeId(dispute.disputeId);
                                      setResolveDisputeId(dispute.disputeId);
                                    }}
                                  >
                                    Use This ID
                                  </button>
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => {
                                      setAssignDisputeId(dispute.disputeId);
                                      setSelectedArbitrators([]);
                                      // Scroll to assign arbitrators section
                                      setTimeout(() => {
                                        const sections = document.querySelectorAll('.section');
                                        sections.forEach((section) => {
                                          const title = section.querySelector('.section-title');
                                          if (title && title.textContent?.includes('Assign Arbitrators')) {
                                            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                          }
                                        });
                                      }, 100);
                                    }}
                                  >
                                    👥 Assign Arbitrators
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📋</div>
                        <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                          {disputesMap.size > 0 ? 'No Disputes Match Filters' : 'No Disputes Yet'}
                        </h3>
                        <p style={{ color: 'var(--color-text-tertiary)' }}>
                          {disputesMap.size > 0 
                            ? 'Try adjusting your search or filter criteria.'
                            : 'No disputes have been raised yet.'}
                        </p>
                      </div>
                    );
                    })()}
                  </div>
                </section>

                {/* Arbitrators List */}
                <section className="section">
                  <div className="section-header">
                    <span className="section-icon">👥</span>
                    <h2 className="section-title">Registered Arbitrators ({activeArbitratorsCount} Active)</h2>
                  </div>
          
                  <div className="grid grid-2">
                    {allArbitrators.length > 0 ? (
                      allArbitrators.map((addr) => {
                        const arb = arbitratorsMap.get(addr);
                        if (!arb) return null;
                        return (
                          <div key={addr} className="card">
                            <div className="card-header">
                              <h3 className="card-title">Arbitrator</h3>
                              <span className={`badge ${arb.isActive ? 'badge-success' : 'badge-error'}`}>
                                {arb.isActive ? '✅ Active' : '❌ Inactive'}
                              </span>
                            </div>
                            <div className="card-body">
                              <div className="card-field">
                                <span className="card-field-label">Address</span>
                                <span className="card-field-value address">{addr.substring(0, 10)}...</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Stake</span>
                                <span className="card-field-value">💰 {formatEther(arb.stake)} MNT</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Reputation</span>
                                <span className="card-field-value">⭐ {Number(arb.reputation)}</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Total Cases</span>
                                <span className="card-field-value">📊 {Number(arb.totalCases)}</span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Active Disputes</span>
                                <span className="card-field-value" style={{
                                  color: (arb.activeDisputes || 0) >= 5 ? 'var(--color-danger, #dc3545)' : 
                                         (arb.activeDisputes || 0) >= 3 ? 'var(--color-warning, #ffc107)' : 
                                         'inherit',
                                  fontWeight: (arb.activeDisputes || 0) >= 3 ? 'bold' : 'normal'
                                }}>
                                  ⚖️ {arb.activeDisputes || 0}
                                  {(arb.activeDisputes || 0) >= 5 && ' ⚠️'}
                                  {(arb.activeDisputes || 0) >= 3 && (arb.activeDisputes || 0) < 5 && ' ⚡'}
                                </span>
                              </div>
                              <div className="card-field">
                                <span className="card-field-label">Success Rate</span>
                                <span className="card-field-value">
                                  {arb.totalCases > 0 
                                    ? `${Math.round((Number(arb.successfulCases) / Number(arb.totalCases)) * 100)}%`
                                    : 'N/A'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                        <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>No Arbitrators Yet</h3>
                        <p style={{ color: 'var(--color-text-tertiary)' }}>Be the first to register as an arbitrator!</p>
                      </div>
                    )}
                </div>
                </section>
              </>
            )}

            {/* Activity History Tab */}
            {activeTab === 'activity' && (
              <section className="section section-full">
                <div className="section-header">
                  <span className="section-icon">📜</span>
                  <h2 className="section-title">
                    Activity History & Transaction Log
                    {(() => {
                      const filtered = filterActivities(activities);
                      return filtered.length !== activities.length ? ` (${filtered.length} of ${activities.length})` : ` (${activities.length} Total)`;
                    })()}
                  </h2>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={exportToCSV}
                      disabled={activities.length === 0}
                    >
                      📥 Export CSV
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={exportToPDF}
                      disabled={activities.length === 0}
                    >
                      📄 Export PDF
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={loadActivityHistory}
                      disabled={activityLoading || !account?.address}
                    >
                      {activityLoading ? '⏳ Loading...' : '🔄 Refresh'}
                    </button>
                  </div>
          </div>

                {/* Filters */}
                <div className="form-grid" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">🔍 Search</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Search activities..."
                      value={activityFilters.searchQuery}
                      onChange={(e) => setActivityFilters({ ...activityFilters, searchQuery: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Type</label>
                    <select
                      className="form-select"
                      value={activityFilters.type}
                      onChange={(e) => setActivityFilters({ ...activityFilters, type: e.target.value as any })}
                    >
                      <option value="all">All Types</option>
                      <option value="registration">📝 Registration</option>
                      <option value="license">🎫 License</option>
                      <option value="payment">💰 Payment</option>
                      <option value="dispute">⚠️ Dispute</option>
                      <option value="transfer">🔄 Transfer</option>
                      <option value="royalty">💎 Royalty</option>
                      <option value="arbitration">⚖️ Arbitration</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Asset ID</label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="Filter by asset ID..."
                      value={activityFilters.assetId}
                      onChange={(e) => setActivityFilters({ ...activityFilters, assetId: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date From</label>
                    <input
                      type="date"
                      className="form-input"
                      value={activityFilters.dateFrom}
                      onChange={(e) => setActivityFilters({ ...activityFilters, dateFrom: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date To</label>
                    <input
                      type="date"
                      className="form-input"
                      value={activityFilters.dateTo}
                      onChange={(e) => setActivityFilters({ ...activityFilters, dateTo: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button
                      className="btn btn-secondary btn-full"
                      onClick={() => setActivityFilters({
                        type: 'all',
                        dateFrom: '',
                        dateTo: '',
                        assetId: '',
                        searchQuery: ''
                      })}
                    >
                      🗑️ Clear Filters
                    </button>
                  </div>
                </div>

                {/* Activity Timeline */}
                {activityLoading ? (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div className="loading-spinner"></div>
                    <p style={{ marginTop: '1rem' }}>Loading activity history...</p>
                  </div>
                ) : filterActivities(activities).length > 0 ? (
                  <div className="activity-timeline">
                    {filterActivities(activities).map((activity) => {
                      const date = new Date(activity.timestamp);
                      const typeIcons = {
                        registration: '📝',
                        license: '🎫',
                        payment: '💰',
                        dispute: '⚠️',
                        transfer: '🔄',
                        royalty: '💎',
                        arbitration: '⚖️'
                      };
                      const typeColors = {
                        registration: 'var(--color-primary, #06b6d4)',
                        license: 'var(--color-success, #10b981)',
                        payment: 'var(--color-warning, #f59e0b)',
                        dispute: 'var(--color-error, #ef4444)',
                        transfer: 'var(--color-info, #3b82f6)',
                        royalty: 'var(--color-purple, #8b5cf6)',
                        arbitration: 'var(--color-secondary, #6366f1)'
                      };

                      return (
                        <div key={activity.id} className="activity-item" style={{
                          display: 'flex',
                          gap: '1rem',
                          padding: '1rem',
                          marginBottom: '1rem',
                          backgroundColor: 'var(--color-bg-secondary)',
                          borderRadius: '8px',
                          borderLeft: `4px solid ${typeColors[activity.type]}`,
                          position: 'relative'
                        }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            backgroundColor: typeColors[activity.type],
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.5rem',
                            flexShrink: 0
                          }}>
                            {typeIcons[activity.type]}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                              <div>
                                <h4 style={{ margin: 0, marginBottom: '0.25rem', fontSize: '1rem', fontWeight: 600 }}>
                                  {activity.description}
                                </h4>
                                {activity.assetName && (
                                  <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                                    Asset: {activity.assetName} {activity.assetId && `(#${activity.assetId})`}
                                  </p>
                                )}
                              </div>
                              <div style={{ textAlign: 'right', fontSize: '0.875rem', color: 'var(--color-text-tertiary)' }}>
                                <div>{date.toLocaleDateString()}</div>
                                <div>{date.toLocaleTimeString()}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                              {activity.actor && (
                                <span style={{ color: 'var(--color-text-secondary)' }}>
                                  👤 {activity.actor.slice(0, 10)}...{activity.actor.slice(-8)}
                                </span>
                              )}
                              {activity.amount !== undefined && activity.amount > 0n && (
                                <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                                  💰 {formatEther(activity.amount)} MNT
                                </span>
                              )}
                              {activity.status && (
                                <span className={`badge ${activity.status === 'Resolved' ? 'badge-success' : 'badge-warning'}`}>
                                  {activity.status}
                                </span>
                              )}
                              {activity.txHash && (
                                <a
                                  href={`https://explorer.testnet.mantle.xyz/tx/${activity.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                                >
                                  🔗 View Transaction
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📜</div>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                      {activities.length > 0 ? 'No Activities Match Filters' : 'No Activity History Yet'}
                    </h3>
                    <p style={{ color: 'var(--color-text-tertiary)' }}>
                      {activities.length > 0 
                        ? 'Try adjusting your search or filter criteria.'
                        : 'Activity history will appear here once you register IP assets, mint licenses, or perform other actions.'}
                    </p>
                  </div>
                )}
              </section>
            )}

            {/* Transfer & Gift Tab */}
            {activeTab === 'transfer' && (
              <section className="section section-full">
                <div className="section-header">
                  <span className="section-icon">🔄</span>
                  <h2 className="section-title">Transfer & Gift IP Assets</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className={`btn ${transferMode === 'transfer' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTransferMode('transfer')}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      🔄 Transfer
                    </button>
                    <button
                      className={`btn ${transferMode === 'gift' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTransferMode('gift')}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      🎁 Gift
                    </button>
                    <button
                      className={`btn ${transferMode === 'history' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setTransferMode('history')}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      📜 History
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={loadTransferHistory}
                      disabled={transferLoading || !account?.address}
                      style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                    >
                      {transferLoading ? '⏳ Loading...' : '🔄 Refresh'}
                    </button>
                  </div>
                </div>

                {/* Transfer Form */}
                {transferMode === 'transfer' && (
                  <div className="card" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>Transfer IP Asset</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                      Transfer ownership of an IP asset to another wallet address. The recipient will become the new owner.
                    </p>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">IP Asset ID</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Enter IP asset token ID..."
                          value={transferForm.tokenId}
                          onChange={(e) => setTransferForm({ ...transferForm, tokenId: e.target.value })}
                        />
                        {transferForm.tokenId && (() => {
                          const tokenId = parseInt(transferForm.tokenId);
                          const asset = ipAssets.get(tokenId);
                          const metadata = parsedMetadata.get(tokenId);
                          if (asset) {
                            const isOwner = asset.owner.toLowerCase() === account?.address?.toLowerCase();
                            return (
                              <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                  {metadata?.name || `IP Asset #${tokenId}`}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                  Owner: {asset.owner.slice(0, 10)}...{asset.owner.slice(-8)}
                                </div>
                                {!isOwner && (
                                  <div style={{ marginTop: '0.5rem', color: 'var(--color-error)', fontSize: '0.85rem' }}>
                                    ⚠️ You are not the owner of this IP asset
                                  </div>
                                )}
                                {asset.isDisputed && (
                                  <div style={{ marginTop: '0.5rem', color: 'var(--color-error)', fontSize: '0.85rem' }}>
                                    ⚠️ This IP asset has active disputes and cannot be transferred
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="form-group">
                        <label className="form-label">Recipient Address</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="0x..."
                          value={transferForm.recipient}
                          onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                        />
                        <small style={{ color: 'var(--color-text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                          Enter the Ethereum address of the recipient
                        </small>
                      </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          const tokenId = parseInt(transferForm.tokenId);
                          if (!tokenId || !transferForm.recipient) {
                            notifyError("Invalid Input", "Please enter both IP asset ID and recipient address");
                            return;
                          }
                          await transferIP(tokenId, transferForm.recipient, false, '', false);
                        }}
                        disabled={loading || !account?.address}
                      >
                        {loading ? '⏳ Transferring...' : '🔄 Transfer IP Asset'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setTransferForm({ tokenId: '', recipient: '', isGift: false, giftMessage: '' })}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Gift Form */}
                {transferMode === 'gift' && (
                  <div className="card" style={{ marginBottom: '2rem' }}>
                    <h3 style={{ marginBottom: '1rem', color: 'var(--color-text-primary)' }}>🎁 Gift IP Asset</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                      Gift an IP asset to someone with an optional message. This is a transfer with a personal touch!
                    </p>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="form-label">IP Asset ID</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Enter IP asset token ID..."
                          value={transferForm.tokenId}
                          onChange={(e) => setTransferForm({ ...transferForm, tokenId: e.target.value })}
                        />
                        {transferForm.tokenId && (() => {
                          const tokenId = parseInt(transferForm.tokenId);
                          const asset = ipAssets.get(tokenId);
                          const metadata = parsedMetadata.get(tokenId);
                          if (asset) {
                            const isOwner = asset.owner.toLowerCase() === account?.address?.toLowerCase();
                            return (
                              <div style={{ marginTop: '0.5rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px' }}>
                                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                  {metadata?.name || `IP Asset #${tokenId}`}
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                  Owner: {asset.owner.slice(0, 10)}...{asset.owner.slice(-8)}
                                </div>
                                {!isOwner && (
                                  <div style={{ marginTop: '0.5rem', color: 'var(--color-error)', fontSize: '0.85rem' }}>
                                    ⚠️ You are not the owner of this IP asset
                                  </div>
                                )}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      <div className="form-group">
                        <label className="form-label">Recipient Address</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="0x..."
                          value={transferForm.recipient}
                          onChange={(e) => setTransferForm({ ...transferForm, recipient: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label className="form-label">Gift Message (Optional)</label>
                        <textarea
                          className="form-input"
                          placeholder="Add a personal message for the recipient..."
                          rows={4}
                          value={transferForm.giftMessage}
                          onChange={(e) => setTransferForm({ ...transferForm, giftMessage: e.target.value })}
                        />
                        <small style={{ color: 'var(--color-text-tertiary)', marginTop: '0.25rem', display: 'block' }}>
                          This message will be recorded with the transfer in the history
                        </small>
                      </div>
                    </div>
                    <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          const tokenId = parseInt(transferForm.tokenId);
                          if (!tokenId || !transferForm.recipient) {
                            notifyError("Invalid Input", "Please enter both IP asset ID and recipient address");
                            return;
                          }
                          await transferIP(tokenId, transferForm.recipient, true, transferForm.giftMessage, false);
                        }}
                        disabled={loading || !account?.address}
                      >
                        {loading ? '⏳ Gifting...' : '🎁 Gift IP Asset'}
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setTransferForm({ tokenId: '', recipient: '', isGift: false, giftMessage: '' })}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Transfer History */}
                {transferMode === 'history' && (
                  <>
                    {/* Filters */}
                    <div className="form-grid" style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                      <div className="form-group">
                        <label className="form-label">Asset ID</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Filter by asset ID..."
                          value={transferFilters.tokenId}
                          onChange={(e) => setTransferFilters({ ...transferFilters, tokenId: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">From Address</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Filter by sender..."
                          value={transferFilters.from}
                          onChange={(e) => setTransferFilters({ ...transferFilters, from: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">To Address</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Filter by recipient..."
                          value={transferFilters.to}
                          onChange={(e) => setTransferFilters({ ...transferFilters, to: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date From</label>
                        <input
                          type="date"
                          className="form-input"
                          value={transferFilters.dateFrom}
                          onChange={(e) => setTransferFilters({ ...transferFilters, dateFrom: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Date To</label>
                        <input
                          type="date"
                          className="form-input"
                          value={transferFilters.dateTo}
                          onChange={(e) => setTransferFilters({ ...transferFilters, dateTo: e.target.value })}
                        />
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'center' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={transferFilters.showGiftsOnly}
                            onChange={(e) => setTransferFilters({ ...transferFilters, showGiftsOnly: e.target.checked })}
                          />
                          Show Gifts Only
                        </label>
                      </div>
                      <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          className="btn btn-secondary btn-full"
                          onClick={() => setTransferFilters({
                            tokenId: '',
                            from: '',
                            to: '',
                            dateFrom: '',
                            dateTo: '',
                            showGiftsOnly: false
                          })}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </div>

                    {/* Transfer History List */}
                    {(() => {
                      let filtered = transferHistory;

                      // Apply filters
                      if (transferFilters.tokenId) {
                        const tokenId = parseInt(transferFilters.tokenId);
                        filtered = filtered.filter(t => t.tokenId === tokenId);
                      }
                      if (transferFilters.from) {
                        const from = transferFilters.from.toLowerCase();
                        filtered = filtered.filter(t => t.from.toLowerCase().includes(from));
                      }
                      if (transferFilters.to) {
                        const to = transferFilters.to.toLowerCase();
                        filtered = filtered.filter(t => t.to.toLowerCase().includes(to));
                      }
                      if (transferFilters.dateFrom) {
                        const fromDate = new Date(transferFilters.dateFrom).getTime();
                        filtered = filtered.filter(t => t.timestamp >= fromDate);
                      }
                      if (transferFilters.dateTo) {
                        const toDate = new Date(transferFilters.dateTo).getTime() + 86400000; // Add 24 hours
                        filtered = filtered.filter(t => t.timestamp <= toDate);
                      }
                      if (transferFilters.showGiftsOnly) {
                        filtered = filtered.filter(t => t.isGift);
                      }

                      return filtered.length > 0 ? (
                        <div className="grid grid-1">
                          {filtered.map((transfer) => (
                            <div key={transfer.id} className="card hover-lift">
                              <div className="card-header">
                                <div>
                                  <h3 className="card-title">
                                    {transfer.isGift ? '🎁 Gift' : '🔄 Transfer'} - {transfer.assetName || `IP Asset #${transfer.tokenId}`}
                                  </h3>
                                  <p className="card-subtitle">Token #{transfer.tokenId}</p>
                                </div>
                                <div className="flex gap-2">
                                  {transfer.isGift && <span className="badge badge-info">🎁 Gift</span>}
                                </div>
                              </div>
                              <div className="card-body">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>From</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                      {transfer.from.slice(0, 10)}...{transfer.from.slice(-8)}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>To</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                      {transfer.to.slice(0, 10)}...{transfer.to.slice(-8)}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Date</div>
                                    <div style={{ fontSize: '0.9rem' }}>
                                      {new Date(transfer.timestamp).toLocaleString()}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Block</div>
                                    <div style={{ fontSize: '0.9rem' }}>
                                      #{transfer.blockNumber.toString()}
                                    </div>
                                  </div>
                                </div>
                                {transfer.giftMessage && (
                                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', borderLeft: '3px solid var(--color-primary)' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Gift Message</div>
                                    <div style={{ fontSize: '0.95rem', fontStyle: 'italic' }}>"{transfer.giftMessage}"</div>
                                  </div>
                                )}
                                <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <a
                                    href={`https://explorer.testnet.mantle.xyz/tx/${transfer.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm btn-secondary"
                                  >
                                    🔗 View Transaction
                                  </a>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔄</div>
                          <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                            {transferHistory.length > 0 ? 'No Transfers Match Filters' : 'No Transfer History Yet'}
                          </h3>
                          <p style={{ color: 'var(--color-text-tertiary)' }}>
                            {transferHistory.length > 0 
                              ? 'Try adjusting your filter criteria.'
                              : 'Transfer history will appear here once you transfer or gift IP assets.'}
                          </p>
                        </div>
                      );
                    })()}
                  </>
                )}
              </section>
            )}
          </div>

          {/* Search and Filter Section */}
          <section className="section section-full">
            <div className="section-header">
              <span className="section-icon">🔍</span>
              <h2 className="section-title">Search & Filter</h2>
            </div>

            {/* Global Search */}
            <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">🔍 Global Search</label>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search IP assets, licenses, disputes..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <select
                    className="form-select"
                    value={searchScope}
                    onChange={(e) => setSearchScope(e.target.value as any)}
                    style={{ width: '150px' }}
                  >
                    <option value="all">All</option>
                    <option value="assets">IP Assets</option>
                    <option value="licenses">Licenses</option>
                    <option value="disputes">Disputes</option>
                  </select>
                  {searchQuery && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setSearchQuery('')}
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Filters */}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">⚡ Quick Filters</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  className={`btn ${assetFilters.ownerFilter === 'mine' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => applyQuickFilter('my-assets')}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  👤 My Assets
                </button>
                <button
                  className={`btn ${assetFilters.licenseStatus === 'licensed' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => applyQuickFilter('licensed')}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  🎫 Licensed
                </button>
                <button
                  className={`btn ${assetFilters.infringementStatus === 'any' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => applyQuickFilter('with-infringements')}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  ⚠️ With Infringements
                </button>
                <button
                  className={`btn ${assetFilters.minRevenue === '0.1' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => applyQuickFilter('high-revenue')}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  💰 High Revenue
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearchQuery('');
                    setAssetFilters({
                      name: '',
                      dateFrom: '',
                      dateTo: '',
                      minRevenue: '',
                      maxRevenue: '',
                      infringementStatus: 'all',
                      licenseStatus: 'all',
                      ownerFilter: 'all',
                      disputed: 'all',
                      encrypted: 'all'
                    });
                  }}
                  style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}
                >
                  🔄 Reset All
                </button>
              </div>
            </div>

            {/* Advanced Filters */}
            <details className="form-group" style={{ marginBottom: '1.5rem' }}>
              <summary className="form-label" style={{ cursor: 'pointer', fontWeight: 600 }}>
                🔧 Advanced Filters
              </summary>
              <div className="form-grid" style={{ marginTop: '1rem' }}>
                {/* Asset Filters */}
                <div className="form-group">
                  <label className="form-label">Filter Type</label>
                  <select
                    className="form-select"
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value as any)}
                  >
                    <option value="assets">IP Assets</option>
                    <option value="licenses">Licenses</option>
                    <option value="disputes">Disputes</option>
                  </select>
                </div>

                {filterType === 'assets' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Filter by name..."
                        value={assetFilters.name}
                        onChange={(e) => setAssetFilters({ ...assetFilters, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date From</label>
                      <input
                        type="date"
                        className="form-input"
                        value={assetFilters.dateFrom}
                        onChange={(e) => setAssetFilters({ ...assetFilters, dateFrom: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date To</label>
                      <input
                        type="date"
                        className="form-input"
                        value={assetFilters.dateTo}
                        onChange={(e) => setAssetFilters({ ...assetFilters, dateTo: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Min Revenue (MNT)</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="0"
                        value={assetFilters.minRevenue}
                        onChange={(e) => setAssetFilters({ ...assetFilters, minRevenue: e.target.value })}
                        step="0.001"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Max Revenue (MNT)</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="∞"
                        value={assetFilters.maxRevenue}
                        onChange={(e) => setAssetFilters({ ...assetFilters, maxRevenue: e.target.value })}
                        step="0.001"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Infringement Status</label>
                      <select
                        className="form-select"
                        value={assetFilters.infringementStatus}
                        onChange={(e) => setAssetFilters({ ...assetFilters, infringementStatus: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="none">No Infringements</option>
                        <option value="any">With Infringements</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">License Status</label>
                      <select
                        className="form-select"
                        value={assetFilters.licenseStatus}
                        onChange={(e) => setAssetFilters({ ...assetFilters, licenseStatus: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="licensed">Licensed</option>
                        <option value="unlicensed">Unlicensed</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Owner</label>
                      <select
                        className="form-select"
                        value={assetFilters.ownerFilter}
                        onChange={(e) => setAssetFilters({ ...assetFilters, ownerFilter: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="mine">My Assets</option>
                        <option value="others">Others' Assets</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Disputed</label>
                      <select
                        className="form-select"
                        value={assetFilters.disputed}
                        onChange={(e) => setAssetFilters({ ...assetFilters, disputed: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="disputed">Disputed</option>
                        <option value="not-disputed">Not Disputed</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Encrypted</label>
                      <select
                        className="form-select"
                        value={assetFilters.encrypted}
                        onChange={(e) => setAssetFilters({ ...assetFilters, encrypted: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="encrypted">Encrypted</option>
                        <option value="not-encrypted">Not Encrypted</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort By</label>
                      <select
                        className="form-select"
                        value={assetSortBy}
                        onChange={(e) => setAssetSortBy(e.target.value as any)}
                      >
                        <option value="date">Date</option>
                        <option value="revenue">Revenue</option>
                        <option value="name">Name</option>
                        <option value="infringements">Infringements</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort Order</label>
                      <select
                        className="form-select"
                        value={assetSortOrder}
                        onChange={(e) => setAssetSortOrder(e.target.value as any)}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </div>
                  </>
                )}

                {filterType === 'licenses' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Filter by name..."
                        value={licenseFilters.name}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date From</label>
                      <input
                        type="date"
                        className="form-input"
                        value={licenseFilters.dateFrom}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, dateFrom: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date To</label>
                      <input
                        type="date"
                        className="form-input"
                        value={licenseFilters.dateTo}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, dateTo: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        value={licenseFilters.status}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, status: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Commercial Use</label>
                      <select
                        className="form-select"
                        value={licenseFilters.commercialUse}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, commercialUse: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="commercial">Commercial</option>
                        <option value="non-commercial">Non-Commercial</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Licensee</label>
                      <select
                        className="form-select"
                        value={licenseFilters.licenseeFilter}
                        onChange={(e) => setLicenseFilters({ ...licenseFilters, licenseeFilter: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="mine">My Licenses</option>
                        <option value="others">Others' Licenses</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort By</label>
                      <select
                        className="form-select"
                        value={licenseSortBy}
                        onChange={(e) => setLicenseSortBy(e.target.value as any)}
                      >
                        <option value="date">Date</option>
                        <option value="royalty">Royalty</option>
                        <option value="name">Name</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort Order</label>
                      <select
                        className="form-select"
                        value={licenseSortOrder}
                        onChange={(e) => setLicenseSortOrder(e.target.value as any)}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </div>
                  </>
                )}

                {filterType === 'disputes' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Name</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Filter by name..."
                        value={disputeFilters.name}
                        onChange={(e) => setDisputeFilters({ ...disputeFilters, name: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date From</label>
                      <input
                        type="date"
                        className="form-input"
                        value={disputeFilters.dateFrom}
                        onChange={(e) => setDisputeFilters({ ...disputeFilters, dateFrom: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Date To</label>
                      <input
                        type="date"
                        className="form-input"
                        value={disputeFilters.dateTo}
                        onChange={(e) => setDisputeFilters({ ...disputeFilters, dateTo: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Status</label>
                      <select
                        className="form-select"
                        value={disputeFilters.status}
                        onChange={(e) => setDisputeFilters({ ...disputeFilters, status: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="resolved">Resolved</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Disputer</label>
                      <select
                        className="form-select"
                        value={disputeFilters.disputerFilter}
                        onChange={(e) => setDisputeFilters({ ...disputeFilters, disputerFilter: e.target.value as any })}
                      >
                        <option value="all">All</option>
                        <option value="mine">My Disputes</option>
                        <option value="others">Others' Disputes</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort By</label>
                      <select
                        className="form-select"
                        value={disputeSortBy}
                        onChange={(e) => setDisputeSortBy(e.target.value as any)}
                      >
                        <option value="date">Date</option>
                        <option value="id">Dispute ID</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Sort Order</label>
                      <select
                        className="form-select"
                        value={disputeSortOrder}
                        onChange={(e) => setDisputeSortOrder(e.target.value as any)}
                      >
                        <option value="desc">Descending</option>
                        <option value="asc">Ascending</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </details>
          </section>

          {/* IP Assets Display */}
          <section className="section section-full">
          <div className="section-header">
            <span className="section-icon">🎨</span>
            <h2 className="section-title">
              Registered IP Assets 
              {(() => {
                const filtered = filterAndSortAssets(ipAssets);
                return filtered.length !== ipAssets.size ? ` (${filtered.length} of ${ipAssets.size})` : ` (${ipAssets.size})`;
              })()}
            </h2>
          </div>
          
          <div className="grid grid-3">
            {filterAndSortAssets(ipAssets).map(([id, asset]) => {
              const metadata = parsedMetadata.get(id) || { name: "Unknown", description: "No description available" };
              const mediaUrl = getIPFSGatewayURL(asset.ipHash);
              
              return (
                <div key={id} className="card hover-lift animate-fade-in">
                  <div className="card-header">
                    <div>
                      <h3 className="card-title">{metadata.name || `IP Asset #${id}`}</h3>
                      <p className="card-subtitle">Token #{id}</p>
                    </div>
                    <div className="flex gap-2">
                      {asset.isEncrypted && <span className="badge badge-warning">🔒 Encrypted</span>}
                      {asset.isDisputed && <span className="badge badge-error">⚠️ Disputed</span>}
                      {infringementData.has(id) && (() => {
                        const infringement = infringementData.get(id)!;
                        if (infringement.totalInfringements > 0) {
                          const severity = calculateSeverity(infringement);
                          const severityConfig = {
                            medium: { icon: '⚡', className: 'badge-warning' },
                            high: { icon: '⚠️', className: 'badge-error' },
                            critical: { icon: '🚨', className: 'badge-error' },
                            low: { icon: '✅', className: 'badge-success' }
                          };
                          const config = severityConfig[severity] || severityConfig.low;
                          return (
                            <span 
                              className={`badge ${config.className}`}
                              title={`${infringement.totalInfringements} infringement(s) detected`}
                            >
                              {config.icon} {infringement.totalInfringements} Infringement{infringement.totalInfringements !== 1 ? 's' : ''}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  
                  {/* Enhanced Media Preview */}
                  {asset.ipHash && (
                    <div className="media-preview">
                      <div className="media-container">
                        <EnhancedAssetPreview 
                          assetId={id}
                          asset={asset}
                          metadata={metadata}
                          mediaUrl={mediaUrl}
                        />
                      </div>
                    </div>
                  )}
                  
                  <div className="card-body">
                    <div className="card-field">
                      <span className="card-field-label">Owner</span>
                      <span className="card-field-value address">{asset.owner.substring(0, 10)}...</span>
                      </div>
                    
                    <div className="card-field">
                      <span className="card-field-label">Description</span>
                      <span className="card-field-value">{metadata.description || "No description"}</span>
                    </div>
                    
                    <div className="card-field">
                      <span className="card-field-label">IP Hash</span>
                      <span className="card-field-value address">{asset.ipHash.substring(0, 20)}...</span>
                    </div>
                    
                    <div className="card-field">
                      <span className="card-field-label">Total Revenue</span>
                      <span className="card-field-value" style={{ 
                        fontSize: '0.85rem',
                        wordBreak: 'break-word', 
                        overflowWrap: 'break-word',
                        maxWidth: '100%',
                        display: 'inline-block'
                      }}>
                        💰 {parseFloat(formatEther(asset.totalRevenue)).toFixed(6)} MNT
                      </span>
                    </div>
                    
                    <div className="card-field">
                      <span className="card-field-label">Royalty Tokens</span>
                      <span className="card-field-value">🎯 {Number(asset.royaltyTokens) / 100}%</span>
                    </div>

                    {/* Infringement Status */}
                    <div className="card-field">
                      <span className="card-field-label">Infringement Status</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {infringementLoading.get(id) ? (
                          <span className="card-field-value" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                            ⏳ Checking...
                          </span>
                        ) : infringementData.has(id) ? (() => {
                          const infringement = infringementData.get(id)!;
                          const severity = calculateSeverity(infringement);
                          const hasInfringements = infringement.totalInfringements > 0;
                          
                          const severityConfig = {
                            low: { icon: '✅', color: '#28a745', bg: '#d4edda' },
                            medium: { icon: '⚡', color: '#ffc107', bg: '#fff3cd' },
                            high: { icon: '⚠️', color: '#fd7e14', bg: '#ffeaa7' },
                            critical: { icon: '🚨', color: '#dc3545', bg: '#f8d7da' }
                          };
                          
                          const config = severityConfig[severity];
                          
                          return (
                            <>
                              <span 
                                className="card-field-value" 
                                style={{ 
                                  fontSize: '0.85rem',
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: config.bg,
                                  color: config.color,
                                  borderRadius: '4px',
                                  fontWeight: 500,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem'
                                }}
                              >
                                {config.icon} {hasInfringements ? `${infringement.totalInfringements} Found` : 'Clean'}
                              </span>
                              <button
                                onClick={() => loadInfringementStatus(id)}
                                disabled={infringementLoading.get(id)}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '0.25rem 0.5rem',
                                  backgroundColor: 'var(--color-primary, #007bff)',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: infringementLoading.get(id) ? 'not-allowed' : 'pointer',
                                  fontWeight: 500,
                                  opacity: infringementLoading.get(id) ? 0.6 : 1
                                }}
                              >
                                {infringementLoading.get(id) ? '⏳ Checking...' : '🔍 Refresh'}
                              </button>
                            </>
                          );
                        })() : (
                          <>
                            <span className="card-field-value" style={{ fontSize: '0.85rem', opacity: 0.7 }}>
                              ⏳ Not Checked
                            </span>
                            <button
                              onClick={() => loadInfringementStatus(id)}
                              disabled={infringementLoading.get(id)}
                              style={{
                                fontSize: '0.75rem',
                                padding: '0.25rem 0.5rem',
                                backgroundColor: 'var(--color-secondary, #6c757d)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: infringementLoading.get(id) ? 'not-allowed' : 'pointer',
                                fontWeight: 500,
                                opacity: infringementLoading.get(id) ? 0.6 : 1
                              }}
                            >
                              {infringementLoading.get(id) ? '⏳ Checking...' : '🔍 Check Now'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {/* Quick Transfer Actions - Only show if user owns the asset */}
                    {asset.owner.toLowerCase() === account?.address?.toLowerCase() && !asset.isDisputed && (
                      <div className="card-actions" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
                        <button
                          className="btn btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}
                          onClick={() => {
                            setActiveTab('transfer');
                            setTransferMode('transfer');
                            setTransferForm({
                              tokenId: id.toString(),
                              recipient: '',
                              isGift: false,
                              giftMessage: ''
                            });
                          }}
                        >
                          🔄 Quick Transfer
                        </button>
                        <button
                          className="btn btn-primary"
                          style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}
                          onClick={() => {
                            setActiveTab('transfer');
                            setTransferMode('gift');
                            setTransferForm({
                              tokenId: id.toString(),
                              recipient: '',
                              isGift: true,
                              giftMessage: ''
                            });
                          }}
                        >
                          🎁 Quick Gift
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            
            {(() => {
              const filtered = filterAndSortAssets(ipAssets);
              if (filtered.length === 0 && ipAssets.size > 0) {
                return (
                  <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>No Assets Match Filters</h3>
                    <p style={{ color: 'var(--color-text-tertiary)' }}>Try adjusting your search or filter criteria.</p>
                  </div>
                );
              } else if (ipAssets.size === 0) {
                return (
              <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎨</div>
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>No IP Assets Yet</h3>
                <p style={{ color: 'var(--color-text-tertiary)' }}>Register your first IP asset to get started!</p>
              </div>
                );
              }
              return null;
            })()}
          </div>
        </section>

        {/* Licenses Display */}
        <section className="section section-full">
          <div className="section-header">
            <span className="section-icon">🎫</span>
            <h2 className="section-title">
              Active Licenses
              {(() => {
                const filtered = filterAndSortLicenses(licenses);
                return filtered.length !== licenses.size ? ` (${filtered.length} of ${licenses.size})` : ` (${licenses.size})`;
              })()}
            </h2>
          </div>
          
          <div className="grid grid-2">
            {filterAndSortLicenses(licenses).map(([id, license]) => (
              <div key={id} className="card hover-lift animate-fade-in">
                <div className="card-header">
                  <div>
                    <h3 className="card-title">License #{id}</h3>
                    <p className="card-subtitle">IP Asset #{Number(license.tokenId)}</p>
                  </div>
                  <div className="flex gap-2">
                    {license.isActive ? (
                      <span className="badge badge-success">✅ Active</span>
                    ) : (
                      <span className="badge badge-error">❌ Inactive</span>
                    )}
                    {license.commercialUse && <span className="badge badge-info">💼 Commercial</span>}
                  </div>
        </div>

                <div className="card-body">
                  <div className="card-field">
                    <span className="card-field-label">Licensee</span>
                    <span className="card-field-value address">{license.licensee.substring(0, 10)}...</span>
        </div>
                  
                  <div className="card-field">
                    <span className="card-field-label">Royalty Rate</span>
                    <span className="card-field-value">💰 {Number(license.royaltyPercentage) / 100}%</span>
      </div>

                  <div className="card-field">
                    <span className="card-field-label">Duration</span>
                    <span className="card-field-value">⏰ {Number(license.duration)} seconds</span>
                  </div>
                  
                  <div className="card-field">
                    <span className="card-field-label">Start Date</span>
                    <span className="card-field-value">
                      📅 {new Date(Number(license.startDate) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <div className="card-field">
                    <span className="card-field-label">Terms Preview</span>
                    <span className="card-field-value">{license.terms.substring(0, 30)}...</span>
                  </div>
                </div>
                
                <div className="card-actions">
                  <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
                    📄 View Terms
                  </button>
                  {license.isActive && (
                    <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
                      🔄 Renew
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {(() => {
              const filtered = filterAndSortLicenses(licenses);
              if (filtered.length === 0 && licenses.size > 0) {
                return (
                  <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔍</div>
                    <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>No Licenses Match Filters</h3>
                    <p style={{ color: 'var(--color-text-tertiary)' }}>Try adjusting your search or filter criteria.</p>
                  </div>
                );
              } else if (licenses.size === 0) {
                return (
              <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎫</div>
                <h3 style={{ marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>No Licenses Yet</h3>
                <p style={{ color: 'var(--color-text-tertiary)' }}>Mint your first license to start licensing IP assets!</p>
              </div>
                );
              }
              return null;
            })()}
          </div>
        </section>
      </div>

      {/* Transfer Approval Dialog */}
      {transferApproval.show && (
        <div className="modal-overlay" onClick={() => setTransferApproval({ ...transferApproval, show: false })}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 style={{ margin: 0 }}>
                {transferApproval.isGift ? '🎁 Confirm Gift' : '🔄 Confirm Transfer'}
              </h2>
              <button
                className="modal-close"
                onClick={() => setTransferApproval({ ...transferApproval, show: false })}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '1.5rem' }}>
                <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)' }}>
                  {transferApproval.isGift 
                    ? 'You are about to gift this IP asset. This action cannot be undone.'
                    : 'You are about to transfer this IP asset. This action cannot be undone.'}
                </p>
                <div style={{ padding: '1rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '8px', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>IP Asset</div>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    {transferApproval.assetName || `IP Asset #${transferApproval.tokenId}`}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--color-text-tertiary)' }}>
                    Token ID: #{transferApproval.tokenId}
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>From</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {account?.address ? `${account.address.slice(0, 10)}...${account.address.slice(-8)}` : 'Unknown'}
                  </div>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>To</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                    {transferApproval.recipient.slice(0, 10)}...{transferApproval.recipient.slice(-8)}
                  </div>
                </div>
                {transferApproval.isGift && transferApproval.giftMessage && (
                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: 'var(--color-bg-secondary)', borderRadius: '4px', borderLeft: '3px solid var(--color-primary)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Gift Message</div>
                    <div style={{ fontSize: '0.95rem', fontStyle: 'italic' }}>"{transferApproval.giftMessage}"</div>
                  </div>
                )}
                <div style={{ padding: '0.75rem', backgroundColor: 'var(--color-warning-bg)', borderRadius: '4px', borderLeft: '3px solid var(--color-warning)' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-warning)' }}>
                    ⚠️ <strong>Warning:</strong> This action is irreversible. Make sure you trust the recipient address.
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => setTransferApproval({ ...transferApproval, show: false })}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={confirmTransfer}
                disabled={loading}
              >
                {loading ? '⏳ Processing...' : (transferApproval.isGift ? '🎁 Confirm Gift' : '🔄 Confirm Transfer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}