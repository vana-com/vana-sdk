/**
 * Simple prompt generator that creates fun, wallet-specific prompts for load testing
 */

/**
 * Generate a silly, personalized prompt based on wallet address
 */
export function generateWalletPrompt(walletAddress: string): string {
  // Use wallet address to deterministically pick a prompt type
  const addressNum = parseInt(walletAddress.slice(-4), 16) % 8;
  
  const prompts = [
    `Create a personalized ASCII art piece using only the characters found in this wallet address: ${walletAddress}`,
    
    `Write a short haiku poem where each line contains letters from this wallet address: ${walletAddress}`,
    
    `Generate a creative acronym using the first 8 characters of this wallet address (${walletAddress.slice(0, 10)}) that describes the user's personality`,
    
    `Create a fun nickname for this user based on the hexadecimal patterns in their wallet address: ${walletAddress}`,
    
    `Write a brief fortune cookie message using words that start with letters found in this address: ${walletAddress}`,
    
    `Design a simple emoji story (3-5 emojis) that represents the "vibe" of this wallet address: ${walletAddress}`,
    
    `Create a short limerick where the last word of each line rhymes with a sound from this address: ${walletAddress.slice(-6)}`,
    
    `Generate 3 creative usernames based on the character patterns in this wallet address: ${walletAddress}`
  ];
  
  return prompts[addressNum];
}

/**
 * Generate a more traditional analysis prompt (for comparison)
 */
export function generateAnalysisPrompt(): string {
  return "Analyze this user's activity patterns, purchase behavior, and preferences. Provide insights about their digital lifestyle and recommendations for personalized experiences.";
}
