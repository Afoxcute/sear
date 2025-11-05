import { checkYakoaTokenExists } from './services/yakoascanner';

async function testYakoaFix() {
  console.log("🧪 Testing Yakoa API fix...");
  
  try {
    // Test with the problematic ID that was causing the error
    const problematicId = "0x0734d90fa1857c073c4bf1e57f4f4151be2e9f82:57:1754506037466";
    const baseId = "0x0734d90fa1857c073c4bf1e57f4f4151be2e9f82:57";
    
    console.log("📋 Original problematic ID:", problematicId);
    console.log("📋 Base ID for API call:", baseId);
    
    // Test the check function with the problematic ID
    console.log("🔍 Testing checkYakoaTokenExists with problematic ID...");
    const result = await checkYakoaTokenExists(problematicId);
    
    console.log("✅ Test completed successfully!");
    console.log("🔍 Result:", result);
    
  } catch (error: any) {
    console.error("❌ Test failed:", error.response?.data || error.message);
  }
}

// Run the test
testYakoaFix().then(() => {
  console.log("🏁 Test completed");
  process.exit(0);
}).catch((error) => {
  console.error("💥 Test failed:", error);
  process.exit(1);
}); 