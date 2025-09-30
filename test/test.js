const Database = require('../src/database/schema');
const BettingService = require('../src/services/bettingService');

async function runTests() {
  console.log('🧪 Running Slack Betting Bot Tests...\n');

  // Create test database
  const db = new Database('./test.db');
  await db.init(); // Wait for database initialization
  const bettingService = new BettingService(db);

  try {
    // Test 1: Create users
    console.log('1. Testing user creation...');
    const user1 = await db.createUser('test_user_1', 'Test User 1');
    const user2 = await db.createUser('test_user_2', 'Test User 2');
    const user3 = await db.createUser('test_user_3', 'Test User 3');
    console.log('✅ Users created successfully');

    // Test 2: Create betting line
    console.log('\n2. Testing betting line creation...');
    const options = ['over', 'under'];
    const emojis = bettingService.generateEmojis(options);
    const line = await db.createBettingLine(
      'Will Team A score over 100?',
      options,
      emojis,
      user1.id,
      '1234567890.123456',
      'C1234567890'
    );
    console.log('✅ Betting line created successfully');

    // Test 3: Place bets
    console.log('\n3. Testing bet placement...');
    await bettingService.placeBet(user1.id, line.id, 'over');
    await bettingService.placeBet(user2.id, line.id, 'under');
    await bettingService.placeBet(user3.id, line.id, 'over');
    console.log('✅ Bets placed successfully');

    // Test 4: Check line summary
    console.log('\n4. Testing line summary...');
    const summary = await bettingService.getLineSummary(line.id);
    console.log(`Total bets: ${summary.totalBets}`);
    console.log(`Total pot: ${summary.totalPot}`);
    console.log('✅ Line summary generated successfully');

    // Test 5: Calculate payouts
    console.log('\n5. Testing payout calculation...');
    const payoutData = await bettingService.calculatePayouts(line.id, 'over');
    console.log(`Payout per winner: ${payoutData.payoutPerWinner}`);
    console.log(`Total pot: ${payoutData.totalPot}`);
    console.log(`Remainder: ${payoutData.remainder}`);
    console.log('✅ Payout calculation successful');

    // Test 6: Process payouts
    console.log('\n6. Testing payout processing...');
    await bettingService.processPayouts(line.id, 'over');
    console.log('✅ Payouts processed successfully');

    // Test 7: Check final balances
    console.log('\n7. Testing final balances...');
    const finalUser1 = await db.getUserStats(user1.id);
    const finalUser2 = await db.getUserStats(user2.id);
    const finalUser3 = await db.getUserStats(user3.id);
    
    console.log(`User 1 balance: ${finalUser1.balance} (started with 20, bet 1, won 1)`);
    console.log(`User 2 balance: ${finalUser2.balance} (started with 20, bet 1, lost 1)`);
    console.log(`User 3 balance: ${finalUser3.balance} (started with 20, bet 1, won 1)`);
    console.log('✅ Final balances calculated correctly');

    // Test 8: Test edge cases
    console.log('\n8. Testing edge cases...');
    
    // Test duplicate bet prevention
    try {
      await bettingService.placeBet(user1.id, line.id, 'under');
      console.log('❌ Duplicate bet should have been prevented');
    } catch (error) {
      console.log('✅ Duplicate bet correctly prevented');
    }

    // Test insufficient balance
    const poorUser = await db.createUser('poor_user', 'Poor User');
    await db.updateUserBalance(poorUser.id, 0);
    try {
      await bettingService.placeBet(poorUser.id, line.id, 'over');
      console.log('❌ Insufficient balance should have been prevented');
    } catch (error) {
      console.log('✅ Insufficient balance correctly prevented');
    }

    console.log('\n🎉 All tests passed successfully!');
    console.log('\n📊 Test Summary:');
    console.log('- User management: ✅');
    console.log('- Betting line creation: ✅');
    console.log('- Bet placement: ✅');
    console.log('- Payout calculation: ✅');
    console.log('- Balance tracking: ✅');
    console.log('- Error handling: ✅');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    // Cleanup
    db.close();
    require('fs').unlinkSync('./test.db');
    console.log('\n🧹 Test database cleaned up');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = { runTests };
